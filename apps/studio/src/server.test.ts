import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkflowEditorDocument } from "@awf/control-plane";
import type { WorkflowDefinition } from "@awf/ir";
import { LocalStudioDemoStore } from "./demo-store.js";
import type { StudioRunRecord, StudioRunSummary } from "./run-store.js";
import { createStudioServer } from "./server.js";

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

let server: Server | undefined;
let directory: string | undefined;

afterEach(async () => {
  if (server !== undefined) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("Studio local server", () => {
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
    expect(runResponse.status).toBe(201);
    const run = (await runResponse.json()) as StudioRunRecord;
    expect(run).toMatchObject({
      status: "completed",
      executionMode: "DETERMINISTIC_SIMULATION",
      nodeStates: { execute: "completed" }
    });
    expect(run.events.map((item: { type: string }) => item.type)).toEqual([
      "RunCreated",
      "NodeScheduled",
      "NodeStarted",
      "ArtifactPublished",
      "NodeCompleted",
      "RunCompleted"
    ]);

    const history = (await fetch(`${base}/api/runs`).then(async (response) => response.json())) as {
      runs: StudioRunSummary[];
    };
    expect(history.runs).toMatchObject([{ runId: run.runId, status: "completed", eventCount: 6 }]);
    const deepLinkedDashboard = await fetch(`${base}/?run=${encodeURIComponent(run.runId)}`).then(
      async (response) => response.text()
    );
    expect(deepLinkedDashboard).toContain("Adaptive Workflow Studio");
    expect(deepLinkedDashboard).toContain("URLSearchParams");
    await expect(
      fetch(`${base}/api/runs/${encodeURIComponent(run.runId)}`).then(async (response) =>
        response.json()
      )
    ).resolves.toMatchObject({ runId: run.runId, artifacts: [{ nodeId: "execute" }] });
  });

  it("serves and deletes a web demo by run ID while preserving the run history", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-studio-demo-"));
    const sourceDirectory = join(directory, "source");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "index.html"), "<h1>run demo</h1>");
    await writeFile(join(sourceDirectory, "styles.css"), "body{color:#191f28}");
    const document = createWorkflowEditorDocument(workflow);
    server = createStudioServer({
      document,
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
    expect(runResponse.status).toBe(201);
    const run = (await runResponse.json()) as StudioRunRecord;
    expect(run.demo).toMatchObject({ entryUrl: `/runs/${run.runId}/demo/` });

    const detail = (await fetch(`${base}/api/runs/${run.runId}`).then(async (response) =>
      response.json()
    )) as StudioRunRecord & { demo: { available: boolean } };
    expect(detail.demo.available).toBe(true);
    await expect(
      fetch(`${base}${detail.demo.entryUrl}`).then(async (response) => response.text())
    ).resolves.toBe("<h1>run demo</h1>");
    expect((await fetch(`${base}${detail.demo.entryUrl}`, { method: "HEAD" })).status).toBe(200);
    await expect(
      fetch(`${base}/runs/${run.runId}/demo/styles.css`).then(async (response) => response.text())
    ).resolves.toBe("body{color:#191f28}");

    const deleted = await fetch(`${base}/api/runs/${run.runId}/demo`, { method: "DELETE" });
    await expect(deleted.json()).resolves.toEqual({ ok: true, runId: run.runId, deleted: true });
    expect((await fetch(`${base}${detail.demo.entryUrl}`)).status).toBe(404);
    const afterDelete = (await fetch(`${base}/api/runs/${run.runId}`).then(async (response) =>
      response.json()
    )) as StudioRunRecord & { demo: { available: boolean } };
    expect(afterDelete.demo.available).toBe(false);
    const history = (await fetch(`${base}/api/runs`).then(async (response) => response.json())) as {
      runs: StudioRunSummary[];
    };
    expect(history.runs).toHaveLength(1);
  });
});
