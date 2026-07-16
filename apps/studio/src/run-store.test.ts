import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  executeStudioProcessRun,
  executeStudioRun,
  InMemoryStudioRunStore,
  JsonlStudioRunStore
} from "./run-store.js";
import type { ExecutedStep, StudioWorkflowExecutor } from "./executor.js";
import { loadStudioInputs, loadWorkflowDocument } from "./server.js";

let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("Studio JSONL run history", () => {
  it("records model invocation at start and completion with measured usage", async () => {
    const document = await loadWorkflowDocument(
      "workflows/templates/spec-to-demo/workflow.wir.yaml"
    );
    const inputs = await loadStudioInputs("workflows/templates/spec-to-demo/input.example.json");
    const buildStep: ExecutedStep = {
      nodeId: "build-demo",
      command: ["fixture-model"],
      workingDirectory: "/fixture",
      startedOffsetMs: 2,
      durationMs: 100,
      exitCode: 0,
      stdout: "",
      stderr: "",
      stdoutPath: "/fixture/build.stdout.log",
      stderrPath: "/fixture/build.stderr.log",
      usage: [
        {
          nodeId: "build-demo",
          provider: "fixture",
          model: "fixture-1",
          inputTokens: 11,
          cachedInputTokens: 3,
          outputTokens: 7,
          reasoningOutputTokens: 2
        }
      ],
      artifacts: []
    };
    const verifyStep: ExecutedStep = {
      ...buildStep,
      nodeId: "verify-release",
      command: ["fixture-verifier"],
      startedOffsetMs: 110,
      durationMs: 10,
      usage: []
    };
    const executor: StudioWorkflowExecutor = {
      descriptor: {
        kind: "local-process",
        workflowId: document.workflow.id,
        workingDirectory: "/fixture",
        executionRoot: "/fixture/runs",
        tokenTelemetry: "codex-jsonl+aawp-events",
        steps: [
          {
            nodeId: "build-demo",
            command: ["fixture-model"],
            timeoutSec: 30,
            tokenTracking: "required"
          },
          {
            nodeId: "verify-release",
            command: ["fixture-verifier"],
            timeoutSec: 30,
            tokenTracking: "optional"
          }
        ]
      },
      async execute(input) {
        await input.onProgress?.({
          type: "executionPrepared",
          executionDirectory: "/fixture/runs/run-model-timing",
          inputPath: "/fixture/runs/run-model-timing/input.json"
        });
        await input.onProgress?.({
          type: "stepStarted",
          nodeId: "build-demo",
          command: buildStep.command,
          workingDirectory: buildStep.workingDirectory,
          startedOffsetMs: buildStep.startedOffsetMs
        });
        await input.onProgress?.({ type: "stepCompleted", step: buildStep });
        await input.onProgress?.({
          type: "stepStarted",
          nodeId: "verify-release",
          command: verifyStep.command,
          workingDirectory: verifyStep.workingDirectory,
          startedOffsetMs: verifyStep.startedOffsetMs
        });
        await input.onProgress?.({ type: "stepCompleted", step: verifyStep });
        return {
          executionDirectory: "/fixture/runs/run-model-timing",
          inputPath: "/fixture/runs/run-model-timing/input.json",
          durationMs: 120,
          steps: [buildStep, verifyStep],
          outputs: {}
        };
      }
    };
    let monotonicTime = 100;
    const run = await executeStudioProcessRun({
      workflow: document.workflow,
      inputs,
      store: new InMemoryStudioRunStore(),
      executor,
      runId: "run-model-timing",
      now: () => "2026-07-15T00:00:00.000Z",
      monotonicNow: () => monotonicTime++
    });
    const invoked = run.events.find((event) => event.type === "ModelInvoked");
    const completed = run.events.find((event) => event.type === "ModelCompleted");
    expect(invoked).toMatchObject({ payload: { nodeId: "build-demo" } });
    expect(completed).toMatchObject({
      payload: {
        nodeId: "build-demo",
        durationMs: 100,
        usage: { inputTokens: 11, outputTokens: 7 }
      }
    });
    expect(invoked?.elapsedMs).toBeLessThan(completed?.elapsedMs ?? 0);
    expect(run.metrics?.tokens).toMatchObject({
      status: "measured",
      coverage: "complete",
      modelInvocations: 1,
      totalTokens: 18
    });
  });

  it("preserves an inspectable demo candidate when a process run fails", async () => {
    const document = await loadWorkflowDocument(
      "workflows/templates/spec-to-demo/workflow.wir.yaml"
    );
    const inputs = await loadStudioInputs("workflows/templates/spec-to-demo/input.example.json");
    const executor: StudioWorkflowExecutor = {
      descriptor: {
        kind: "local-process",
        workflowId: document.workflow.id,
        workingDirectory: "/fixture",
        executionRoot: "/fixture/runs",
        tokenTelemetry: "codex-jsonl+aawp-events",
        steps: document.workflow.nodes.map((node) => ({
          nodeId: node.id,
          command: ["fixture"],
          timeoutSec: 30,
          tokenTracking: "none"
        }))
      },
      async execute() {
        throw new Error("release verifier failed");
      }
    };

    const run = await executeStudioProcessRun({
      workflow: document.workflow,
      inputs,
      store: new InMemoryStudioRunStore(),
      executor,
      runId: "run-failed-candidate",
      createDemoSnapshot: async () => ({
        label: "demo",
        entryUrl: "/runs/run-failed-candidate/demo/",
        contentDigest: "candidate-digest"
      })
    });

    expect(run).toMatchObject({
      status: "failed",
      demo: {
        entryUrl: "/runs/run-failed-candidate/demo/",
        contentDigest: "candidate-digest"
      },
      metrics: {
        timing: {
          resultBuild: { kind: "snapshot_materialization", status: "measured" }
        }
      }
    });
  });

  it("preserves a completed run across store instances", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-studio-"));
    const path = join(directory, "runs.jsonl");
    const document = await loadWorkflowDocument("examples/spec-to-demo.wir.yaml");
    const inputs = await loadStudioInputs("examples/spec-to-demo.input.json");
    const firstStore = new JsonlStudioRunStore(path);

    let monotonicTime = 100;
    const run = await executeStudioRun({
      workflow: document.workflow,
      inputs,
      store: firstStore,
      runId: "run-persisted",
      now: () => "2026-07-14T00:00:00.000Z",
      monotonicNow: () => monotonicTime++
    });
    expect(run).toMatchObject({
      status: "completed",
      nodeStates: { "build-demo": "completed", "verify-release": "completed" }
    });
    expect(run.events.map((event) => event.elapsedMs)).toEqual([0, 5, 5, 6, 6, 7, 7, 8, 8, 13]);
    expect(run.events.map((event) => event.occurredAt)).toEqual(
      [...run.events]
        .sort((left, right) => (left.elapsedMs ?? 0) - (right.elapsedMs ?? 0))
        .map((event) => event.occurredAt)
    );
    expect(run.events.find((event) => event.type === "NodeCompleted")?.payload).toMatchObject({
      durationMs: 1
    });
    expect(run.metrics).toEqual({
      timing: {
        workflowDurationMs: 13,
        inputValidationMs: 1,
        deterministicSimulationMs: 7,
        resultBuild: {
          kind: "snapshot_materialization",
          status: "not_applicable",
          durationMs: 0
        }
      },
      tokens: {
        status: "measured",
        source: "runtime_events",
        modelInvocations: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      },
      trace: {
        traceId: "run-persisted",
        eventCount: 10,
        workflowDigest: run.workflowDigest,
        inputDigest: run.inputDigest,
        traceDigest: run.traceDigest
      }
    });

    const reopenedStore = new JsonlStudioRunStore(path);
    await expect(reopenedStore.list()).resolves.toMatchObject([
      { runId: "run-persisted", status: "completed", eventCount: 10, artifactCount: 2 }
    ]);
    await expect(reopenedStore.get("run-persisted")).resolves.toMatchObject({
      traceDigest: run.traceDigest,
      outputs: run.outputs
    });
    const source = await readFile(path, "utf8");
    expect(source.endsWith("\n")).toBe(true);
    expect(source.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(source) as unknown).toMatchObject({
      schemaVersion: "awf/studio-run/v1",
      runId: "run-persisted"
    });
  });

  it("keeps timing, zero-token evidence, and trace identity for failed runs", async () => {
    const document = await loadWorkflowDocument("examples/spec-to-demo.wir.yaml");
    let monotonicTime = 10;
    const run = await executeStudioRun({
      workflow: document.workflow,
      inputs: {},
      store: new InMemoryStudioRunStore(),
      runId: "run-failed-metrics",
      now: () => "2026-07-15T00:00:00.000Z",
      monotonicNow: () => monotonicTime++
    });

    expect(run).toMatchObject({
      status: "failed",
      metrics: {
        timing: { workflowDurationMs: expect.any(Number) },
        tokens: { modelInvocations: 0, totalTokens: 0 },
        trace: {
          traceId: "run-failed-metrics",
          eventCount: 2,
          workflowDigest: run.workflowDigest,
          inputDigest: run.inputDigest
        }
      }
    });
    expect(run.metrics?.trace.traceDigest).toBeUndefined();
  });
});
