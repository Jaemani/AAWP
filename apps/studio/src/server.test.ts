import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkflowEditorDocument } from "@awf/control-plane";
import type { WorkflowDefinition } from "@awf/ir";
import { LocalStudioDemoStore } from "./demo-store.js";
import { LocalProcessWorkflowExecutor, parseLocalExecutionManifest } from "./executor.js";
import type { StudioWorkflowExecutor } from "./executor.js";
import type { StudioRunRecord, StudioRunSummary } from "./run-store.js";
import { createStudioServer, loadStudioWorkflowCatalog, loadWorkflowDocument } from "./server.js";

const port = { type: "value", schemaVersion: "1", visibility: "public" as const };
const workflow: WorkflowDefinition = {
  apiVersion: "awf/v1",
  id: "server-fixture",
  version: "1",
  mode: "DIRECT",
  artifactSchemas: [{ type: "value", schemaVersion: "1", schema: true }],
  inputs: { input: port },
  outputs: { output: port },
  verifierDefinitions: [],
  scopePolicy: {},
  nodes: [
    {
      id: "execute",
      kind: "deterministic",
      version: "1",
      owner: { id: "operator", role: "operator" },
      inputs: { input: port },
      outputs: { output: port },
      reads: [],
      writes: [],
      capabilities: {
        filesystemRead: [],
        filesystemWrite: [],
        network: [],
        tools: [],
        secretRefs: []
      },
      budget: { maxAttempts: 1, timeoutSec: 30 },
      cache: { mode: "exact", includeModelRevision: true, includeEnvironmentDigest: true },
      verifiers: [],
      retryPolicy: { retryableClasses: [], backoff: "fixed" }
    }
  ],
  edges: [
    {
      source: { kind: "workflowInput", port: "input" },
      target: { kind: "nodeInput", nodeId: "execute", port: "input" }
    },
    {
      source: { kind: "nodeOutput", nodeId: "execute", port: "output" },
      target: { kind: "workflowOutput", port: "output" }
    }
  ],
  releasePolicy: { requiredVerifiers: [], maxBlockingFindings: 0 }
};

function createExecutor(workingDirectory: string): LocalProcessWorkflowExecutor {
  return new LocalProcessWorkflowExecutor(
    parseLocalExecutionManifest(
      {
        schemaVersion: "aawp/local-execution-manifest/v1",
        workflowId: workflow.id,
        workingDirectory,
        steps: [
          {
            nodeId: "execute",
            command: [
              process.execPath,
              "-e",
              "setTimeout(()=>console.log(JSON.stringify({ok:true})),75)"
            ],
            timeoutSec: 10,
            tokenTracking: "none",
            outputs: [{ port: "output", source: "stdout" }]
          }
        ]
      },
      workflow
    ),
    { executionRoot: join(workingDirectory, "executions") }
  );
}

async function waitForTerminalRun(base: string, runId: string): Promise<StudioRunRecord> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const record = (await fetch(`${base}/api/runs/${runId}`).then(async (response) =>
      response.json()
    )) as StudioRunRecord;
    if (record.status !== "running") return record;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`run did not complete: ${runId}`);
}

let server: Server | undefined;
let directory: string | undefined;

afterEach(async () => {
  if (server !== undefined) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("Studio local server", () => {
  it("turns structured web input into a pinned spec-to-demo request before execution", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-studio-launcher-"));
    await mkdir(join(directory, "specs"));
    await writeFile(
      join(directory, "DESIGN.md"),
      "---\nname: Launcher fixture\nversion: 1.0.0\n---\n"
    );
    await writeFile(
      join(directory, "specs", "source.json"),
      JSON.stringify({ screens: [{ id: "admin-policy-list", actors: [], components: [] }] })
    );
    const document = await loadWorkflowDocument(
      "workflows/templates/spec-to-demo/workflow.wir.yaml"
    );
    let capturedInputs: unknown;
    const executor: StudioWorkflowExecutor = {
      descriptor: {
        kind: "local-process",
        workflowId: "spec-to-demo",
        workingDirectory: directory,
        executionRoot: join(directory, "runs"),
        tokenTelemetry: "codex-jsonl+aawp-events",
        steps: []
      },
      async execute(input) {
        capturedInputs = input.inputs;
        return {
          executionDirectory: join(directory!, "runs", input.runId),
          inputPath: join(directory!, "runs", input.runId, "input.json"),
          durationMs: 0,
          steps: [],
          outputs: {}
        };
      }
    };
    server = createStudioServer({
      document,
      workflows: [
        {
          document,
          displayName: "Spec to demo",
          description: "fixture",
          inputKind: "spec-to-demo",
          projectRoot: directory,
          executor
        }
      ]
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const started = (await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId: "spec-to-demo",
        launcher: {
          kind: "spec-to-demo",
          sourcePath: "specs/source.json",
          screenIds: ["admin-policy-list"],
          entryScreenId: "admin-policy-list",
          requestText: "정책 목록 데모를 만들어줘"
        }
      })
    }).then(async (response) => response.json())) as StudioRunRecord;
    expect(started.runId, JSON.stringify(started)).toBeDefined();
    const terminal = await waitForTerminalRun(base, started.runId);
    expect(terminal.error).toBeUndefined();
    expect(capturedInputs).toMatchObject({
      brief: {
        requestText: "정책 목록 데모를 만들어줘",
        requestedScreens: ["admin-policy-list"],
        sourceSpec: { projection: "requested-screen-closure-v3" },
        designContract: { version: "1.0.0" }
      }
    });

    const escaping = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId: "spec-to-demo",
        launcher: {
          sourcePath: "../outside.json",
          screenIds: ["admin-policy-list"],
          requestText: "invalid"
        }
      })
    });
    expect(escaping.status).toBe(400);
    await expect(escaping.json()).resolves.toMatchObject({
      ok: false,
      message: expect.stringMatching(/workspace/)
    });
  });

  it("serves executable workflow catalog entries with typed launchers", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-studio-catalog-"));
    const workflows = await loadStudioWorkflowCatalog({
      path: "workflows/catalog.json",
      executionRoot: join(directory, "runs")
    });
    expect(workflows.map((entry) => entry.document.workflow.id)).toEqual([
      "spec-to-demo",
      "spec-feedback-to-spec"
    ]);
    expect(workflows[0]?.executor).toBeDefined();
    expect(workflows[1]?.executor).toBeDefined();

    server = createStudioServer({ document: workflows[0]!.document, workflows });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    await expect(
      fetch(`${base}/api/workflows`).then(async (response) => response.json())
    ).resolves.toMatchObject({
      workflows: [
        { id: "spec-to-demo", inputKind: "spec-to-demo", executable: true },
        {
          id: "spec-feedback-to-spec",
          inputKind: "spec-feedback-to-spec",
          executable: true
        }
      ]
    });
    const executablePage = await fetch(`${base}/?workflow=spec-to-demo`).then(async (response) =>
      response.text()
    );
    expect(executablePage).toContain("Project workspace · 7 local steps");
    expect(executablePage).toContain('id="source-spec-path"');
    expect(executablePage).toContain('id="screen-ids"');
    expect(executablePage).toContain('id="request-text"');
    const feedbackPage = await fetch(`${base}/?workflow=spec-feedback-to-spec`).then(
      async (response) => response.text()
    );
    expect(feedbackPage).toContain('id="feedback-source-path"');
    expect(feedbackPage).toContain('id="feedback-document-path"');
    expect(feedbackPage).toContain('id="target-maturity"');
    expect(feedbackPage).toContain('id="run-workflow" class="run-button" type="button"');
    await expect(
      fetch(`${base}/api/execution?workflow=spec-feedback-to-spec`).then(async (response) =>
        response.json()
      )
    ).resolves.toMatchObject({ executable: true, descriptor: { kind: "local-process" } });
  });

  it("completes a non-demo catalog workflow without requiring a demo snapshot", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-studio-non-demo-"));
    const document = createWorkflowEditorDocument(workflow);
    server = createStudioServer({
      document,
      workflows: [
        {
          document,
          displayName: "Artifact workflow",
          description: "Produces artifacts but no web demo",
          inputKind: "json",
          executor: createExecutor(directory)
        }
      ],
      demoStore: new LocalStudioDemoStore({
        rootDirectory: join(directory, "results"),
        sourceDirectory: join(directory, "missing-demo-source")
      })
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const started = (await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowId: workflow.id, inputs: { input: { message: "hello" } } })
    }).then(async (response) => response.json())) as StudioRunRecord;
    const completed = await waitForTerminalRun(base, started.runId);

    expect(completed).toMatchObject({
      status: "completed",
      workflowId: workflow.id,
      metrics: {
        timing: {
          resultBuild: { kind: "snapshot_materialization", status: "not_applicable" }
        }
      }
    });
    expect(completed.demo).toBeUndefined();
  });

  it("serves a read-only source and compiler-backed candidate check", async () => {
    const document = createWorkflowEditorDocument(workflow);
    server = createStudioServer({ document });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const source = await fetch(`${base}/api/workflow`).then(async (response) => response.json());
    expect(source).toMatchObject({ digest: document.digest });

    const valid = await fetch(`${base}/api/check`, {
      method: "POST",
      body: document.canonicalJson
    }).then(async (response) => response.json());
    expect(valid).toEqual({
      ok: true,
      digest: document.digest,
      canonicalJson: document.canonicalJson
    });

    const invalidResponse = await fetch(`${base}/api/check`, { method: "POST", body: "{}" });
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({ ok: false });

    const runResponse = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { input: { message: "hello" } } })
    });
    expect(runResponse.status).toBe(409);
    await expect(runResponse.json()).resolves.toMatchObject({
      ok: false,
      code: "WORKFLOW_NOT_EXECUTABLE"
    });

    const history = (await fetch(`${base}/api/runs`).then(async (response) => response.json())) as {
      runs: StudioRunSummary[];
    };
    expect(history.runs).toEqual([]);
    const deepLinkedDashboard = await fetch(`${base}/?run=run_missing`).then(async (response) =>
      response.text()
    );
    expect(deepLinkedDashboard).toContain("AAWP Studio");
    expect(deepLinkedDashboard).toContain("URLSearchParams");
    await expect(
      fetch(`${base}/api/execution`).then(async (response) => response.json())
    ).resolves.toMatchObject({ executable: false, reason: "NO_EXECUTION_MANIFEST" });
  });

  it("onboards, offboards, and deletes a demo snapshot while preserving run history", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-studio-demo-"));
    const sourceDirectory = join(directory, "source");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "index.html"), "<h1>run demo</h1>");
    await writeFile(join(sourceDirectory, "styles.css"), "body{color:#191f28}");
    const document = createWorkflowEditorDocument(workflow);
    server = createStudioServer({
      document,
      executor: createExecutor(directory),
      demoStore: new LocalStudioDemoStore({
        rootDirectory: join(directory, "results"),
        sourceDirectory
      })
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const runResponse = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { input: { message: "hello" } } })
    });
    expect(runResponse.status).toBe(202);
    const startedRun = (await runResponse.json()) as StudioRunRecord;
    expect(startedRun.status).toBe("running");
    const duplicateRun = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { input: { message: "duplicate" } } })
    });
    expect(duplicateRun.status).toBe(409);
    await expect(duplicateRun.json()).resolves.toMatchObject({
      code: "WORKFLOW_ALREADY_RUNNING"
    });
    const run = await waitForTerminalRun(base, startedRun.runId);
    expect(run).toMatchObject({
      status: "completed",
      executionMode: "LOCAL_PROCESS",
      nodeStates: { execute: "completed" },
      metrics: {
        timing: { actualExecutionMs: expect.any(Number) },
        tokens: { status: "measured", coverage: "complete", totalTokens: 0 }
      }
    });
    expect(run.artifacts[0]?.artifactId).toMatch(/^artifact_/);
    expect(run.artifacts[0]?.artifactId).not.toMatch(/^sim_/);
    expect(run.demo).toMatchObject({ entryUrl: `/runs/${run.runId}/demo/` });
    expect(run.metrics).toMatchObject({
      timing: {
        resultBuild: { kind: "snapshot_materialization", status: "measured" }
      },
      tokens: { modelInvocations: 0, totalTokens: 0 },
      trace: { traceId: run.runId, eventCount: run.events.length }
    });

    let detail = (await fetch(`${base}/api/runs/${run.runId}`).then(async (response) =>
      response.json()
    )) as StudioRunRecord & {
      demo: { snapshotAvailable: boolean; onboarded: boolean };
    };
    expect(detail.demo).toMatchObject({ snapshotAvailable: true, onboarded: false });
    expect((await fetch(`${base}${detail.demo.entryUrl}`)).status).toBe(404);
    await expect(
      fetch(`${base}/runs/${run.runId}/demo-preview/`).then(async (response) => response.text())
    ).resolves.toBe("<h1>run demo</h1>");
    await expect(
      fetch(`${base}/runs/${run.runId}/demo-preview/styles.css`).then(async (response) =>
        response.text()
      )
    ).resolves.toBe("body{color:#191f28}");
    expect((await fetch(`${base}/runs/${run.runId}/demo-preview/.aawp-onboarded`)).status).toBe(
      404
    );
    expect((await fetch(`${base}/runs/${run.runId}/demo-preview/../outside.txt`)).status).toBe(404);

    const onboarded = await fetch(`${base}/api/runs/${run.runId}/demo/onboard`, {
      method: "POST"
    });
    await expect(onboarded.json()).resolves.toMatchObject({
      ok: true,
      changed: true,
      onboarded: true
    });
    await expect(
      fetch(`${base}${detail.demo.entryUrl}`).then(async (response) => response.text())
    ).resolves.toBe("<h1>run demo</h1>");
    expect((await fetch(`${base}${detail.demo.entryUrl}`, { method: "HEAD" })).status).toBe(200);
    await expect(
      fetch(`${base}/runs/${run.runId}/demo/styles.css`).then(async (response) => response.text())
    ).resolves.toBe("body{color:#191f28}");

    const offboarded = await fetch(`${base}/api/runs/${run.runId}/demo/offboard`, {
      method: "POST"
    });
    await expect(offboarded.json()).resolves.toMatchObject({
      ok: true,
      changed: true,
      onboarded: false
    });
    expect((await fetch(`${base}${detail.demo.entryUrl}`)).status).toBe(404);
    expect((await fetch(`${base}/runs/${run.runId}/demo-preview/`)).status).toBe(200);
    detail = (await fetch(`${base}/api/runs/${run.runId}`).then(async (response) =>
      response.json()
    )) as typeof detail;
    expect(detail.demo).toMatchObject({ snapshotAvailable: true, onboarded: false });

    const deleted = await fetch(`${base}/api/runs/${run.runId}/demo`, { method: "DELETE" });
    await expect(deleted.json()).resolves.toEqual({ ok: true, runId: run.runId, deleted: true });
    expect((await fetch(`${base}${detail.demo.entryUrl}`)).status).toBe(404);
    expect((await fetch(`${base}/runs/${run.runId}/demo-preview/`)).status).toBe(404);
    const afterDelete = (await fetch(`${base}/api/runs/${run.runId}`).then(async (response) =>
      response.json()
    )) as StudioRunRecord & {
      demo: { snapshotAvailable: boolean; onboarded: boolean };
    };
    expect(afterDelete.demo).toMatchObject({ snapshotAvailable: false, onboarded: false });
    const history = (await fetch(`${base}/api/runs`).then(async (response) => response.json())) as {
      runs: StudioRunSummary[];
    };
    expect(history.runs).toHaveLength(1);
  });
});
