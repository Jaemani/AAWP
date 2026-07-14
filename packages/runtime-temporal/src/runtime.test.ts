import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";
import {
  RuntimeNodeError,
  type NodeExecutionRequest,
  type NodeExecutor,
  type NodeProjectionRequest,
  type NodeProjectionSink,
  type RuntimeStartRequest
} from "@awf/runtime-core";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTemporalWorker } from "./worker.js";
import { TemporalRuntimePort, temporalWorkflowId } from "./runtime.js";
import type { TemporalRunStatus } from "./types.js";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));
const brief = { type: "artifact.brief", schemaVersion: "1", visibility: "public" as const };
const result = { type: "artifact.result", schemaVersion: "1", visibility: "public" as const };

function node(
  id: string,
  kind: WorkflowNode["kind"] = "deterministic",
  overrides: Partial<WorkflowNode> = {}
): WorkflowNode {
  return {
    id,
    kind,
    version: "1",
    owner: { id: "builder", role: "builder" },
    inputs: { input: brief },
    outputs: { output: result },
    reads: [],
    writes: [],
    capabilities: {
      filesystemRead: [],
      filesystemWrite: [],
      network: [],
      tools: [],
      secretRefs: []
    },
    budget: { maxAttempts: 3, timeoutSec: 5 },
    cache: { mode: "disabled", includeModelRevision: true, includeEnvironmentDigest: true },
    verifiers: [],
    retryPolicy: { retryableClasses: [], backoff: "fixed" },
    ...(kind === "side_effect"
      ? { sideEffect: { operation: "publish", idempotencyKeyTemplate: "runtime" } }
      : {}),
    ...overrides
  };
}

function workflow(nodes: WorkflowNode[]): WorkflowDefinition {
  const normalized = nodes.map((item, index) =>
    index === 0 ? item : { ...item, inputs: { input: result } }
  );
  const edges: WorkflowDefinition["edges"] = [
    {
      source: { kind: "workflowInput", port: "brief" },
      target: { kind: "nodeInput", nodeId: normalized[0]!.id, port: "input" }
    }
  ];
  for (let index = 1; index < normalized.length; index += 1) {
    edges.push({
      source: { kind: "nodeOutput", nodeId: normalized[index - 1]!.id, port: "output" },
      target: { kind: "nodeInput", nodeId: normalized[index]!.id, port: "input" }
    });
  }
  edges.push({
    source: { kind: "nodeOutput", nodeId: normalized.at(-1)!.id, port: "output" },
    target: { kind: "workflowOutput", port: "result" }
  });
  return {
    apiVersion: "awf/v1",
    id: "temporal-test",
    version: "1",
    mode: "CONTRACT",
    artifactSchemas: [
      { type: "artifact.brief", schemaVersion: "1", schema: true },
      { type: "artifact.result", schemaVersion: "1", schema: true }
    ],
    inputs: { brief },
    outputs: { result },
    verifierDefinitions: [
      {
        id: "release",
        owner: { id: "verifier", role: "verifier" },
        visibility: "public"
      }
    ],
    scopePolicy: { allowedSecrets: [], allowedNetworkHosts: [] },
    nodes: normalized,
    edges,
    releasePolicy: { requiredVerifiers: ["release"], maxBlockingFindings: 0 }
  };
}

function request(
  definition: WorkflowDefinition,
  runId = randomUUID(),
  nodeControls?: RuntimeStartRequest["nodeControls"]
): RuntimeStartRequest {
  return {
    tenantId: "tenant-a",
    runId,
    workflow: definition,
    inputs: { brief: { title: "test" } },
    ...(nodeControls === undefined ? {} : { nodeControls })
  };
}

function output(request: NodeExecutionRequest): Record<string, unknown> {
  return { output: { nodeId: request.node.id, attempt: request.attempt } };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForStatus(
  environment: TestWorkflowEnvironment,
  tenantId: string,
  runId: string,
  phase: TemporalRunStatus["phase"]
): Promise<void> {
  const handle = environment.client.workflow.getHandle(temporalWorkflowId(tenantId, runId));
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const status = await handle.query<TemporalRunStatus>("runtimeStatus");
      if (status.phase === phase) return;
    } catch {
      // Query handler may not be registered until the first Workflow Task completes.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`workflow did not reach ${phase}`);
}

async function workerFor(
  environment: TestWorkflowEnvironment,
  taskQueue: string,
  executor: NodeExecutor,
  projectionSink?: NodeProjectionSink
): Promise<Worker> {
  return createTemporalWorker({
    connection: environment.nativeConnection,
    taskQueue,
    executor,
    ...(projectionSink === undefined ? {} : { projectionSink }),
    workflowsPath
  });
}

describe.sequential("Temporal durable runtime", () => {
  let environment: TestWorkflowEnvironment;

  beforeAll(async () => {
    environment = await TestWorkflowEnvironment.createLocal();
  }, 120_000);

  afterAll(async () => {
    await environment?.teardown();
  });

  it("maps WIR nodes to activities and projects results", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const projected: string[] = [];
    const executor: NodeExecutor = { execute: async (item) => output(item) };
    const sink: NodeProjectionSink = {
      record: async (item) => {
        projected.push(item.nodeId);
      }
    };
    const worker = await workerFor(environment, taskQueue, executor, sink);
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    const resultValue = await worker.runUntil(async () => {
      const handle = await runtime.start(request(workflow([node("build")])));
      return handle.result();
    });
    expect(resultValue.completedNodeIds).toEqual(["build"]);
    expect(projected).toEqual(["build"]);
  }, 60_000);

  it("scopes Temporal workflow identity by tenant and run", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const runId = randomUUID();
    const executor: NodeExecutor = { execute: async (item) => output(item) };
    const worker = await workerFor(environment, taskQueue, executor);
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    const resultValues = await worker.runUntil(async () => {
      const handles = await Promise.all(
        ["tenant-a", "tenant-b"].map((tenantId) =>
          runtime.start({ ...request(workflow([node("build")]), runId), tenantId })
        )
      );
      return Promise.all(handles.map((handle) => handle.result()));
    });
    expect(resultValues.map((item) => item.runId)).toEqual([runId, runId]);
  }, 60_000);

  it("does not retry authorization failures and retries declared capacity failures", async () => {
    const authQueue = `awf-${randomUUID()}`;
    let authAttempts = 0;
    const authExecutor: NodeExecutor = {
      execute: async () => {
        authAttempts += 1;
        throw new RuntimeNodeError("AUTHORIZATION", "denied");
      }
    };
    const authWorker = await workerFor(environment, authQueue, authExecutor);
    const authRuntime = new TemporalRuntimePort(environment.client, authQueue);
    await expect(
      authWorker.runUntil(async () => {
        const handle = await authRuntime.start(
          request(
            workflow([
              node("auth", "tool", {
                retryPolicy: { retryableClasses: ["CAPACITY"], backoff: "fixed" }
              })
            ])
          )
        );
        return handle.result();
      })
    ).rejects.toThrow();
    expect(authAttempts).toBe(1);

    const capacityQueue = `awf-${randomUUID()}`;
    let capacityAttempts = 0;
    const capacityExecutor: NodeExecutor = {
      execute: async (item) => {
        capacityAttempts += 1;
        if (capacityAttempts === 1) throw new RuntimeNodeError("CAPACITY", "busy");
        return output(item);
      }
    };
    const capacityWorker = await workerFor(environment, capacityQueue, capacityExecutor);
    const capacityRuntime = new TemporalRuntimePort(environment.client, capacityQueue);
    await capacityWorker.runUntil(async () => {
      const handle = await capacityRuntime.start(
        request(
          workflow([
            node("capacity", "tool", {
              retryPolicy: { retryableClasses: ["CAPACITY"], backoff: "fixed" }
            })
          ])
        )
      );
      return handle.result();
    });
    expect(capacityAttempts).toBe(2);
  }, 60_000);

  it("survives a worker restart while waiting for approval", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const runId = randomUUID();
    const executor: NodeExecutor = { execute: async (item) => output(item) };
    const firstWorker = await workerFor(environment, taskQueue, executor);
    const firstRun = firstWorker.run();
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    const handle = await runtime.start(request(workflow([node("approve", "approval")]), runId));
    await waitForStatus(environment, "tenant-a", runId, "waiting_approval");
    firstWorker.shutdown();
    await firstRun;

    await handle.signal("resolveApproval", {
      nodeId: "approve",
      approved: true,
      decidedBy: "operator"
    });
    const secondWorker = await workerFor(environment, taskQueue, executor);
    const resultValue = await secondWorker.runUntil(() => handle.result());
    expect(resultValue.completedNodeIds).toEqual(["approve"]);
  }, 60_000);

  it("survives a worker restart while a durable timer is pending", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const runId = randomUUID();
    const executor: NodeExecutor = { execute: async (item) => output(item) };
    const firstWorker = await workerFor(environment, taskQueue, executor);
    const firstRun = firstWorker.run();
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    const handle = await runtime.start(
      request(workflow([node("pause", "wait")]), runId, { pause: { waitMs: 200 } })
    );
    await waitForStatus(environment, "tenant-a", runId, "waiting_timer");
    firstWorker.shutdown();
    await firstRun;
    await new Promise((resolve) => setTimeout(resolve, 250));

    const secondWorker = await workerFor(environment, taskQueue, executor);
    const resultValue = await secondWorker.runUntil(() => handle.result());
    expect(resultValue.completedNodeIds).toEqual(["pause"]);
  }, 60_000);

  it("propagates workflow cancellation to a running activity", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const started = deferred();
    const cancelled = deferred();
    let attempts = 0;
    const executor: NodeExecutor = {
      execute: async (_item, signal) => {
        attempts += 1;
        started.resolve();
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              cancelled.resolve();
              reject(signal.reason);
            },
            { once: true }
          );
        });
      }
    };
    const worker = await workerFor(environment, taskQueue, executor);
    const workerRun = worker.run();
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    const handle = await runtime.start(request(workflow([node("long", "tool")])));
    await started.promise;
    await handle.cancel();
    await expect(handle.result()).rejects.toThrow();
    await cancelled.promise;
    expect(attempts).toBe(1);
    worker.shutdown();
    await workerRun;
  }, 60_000);

  it("recovers after a worker stops in the middle of an activity", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const firstStarted = deferred();
    let attempts = 0;
    const executor: NodeExecutor = {
      execute: async (item, signal) => {
        attempts += 1;
        if (attempts > 1) return output(item);
        firstStarted.resolve();
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
    };
    const firstWorker = await workerFor(environment, taskQueue, executor);
    const firstRun = firstWorker.run();
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    const handle = await runtime.start(request(workflow([node("recover", "tool")])));
    await firstStarted.promise;
    firstWorker.shutdown();
    await firstRun;

    const secondWorker = await workerFor(environment, taskQueue, executor);
    const resultValue = await secondWorker.runUntil(() => handle.result());
    expect(resultValue.completedNodeIds).toEqual(["recover"]);
    expect(attempts).toBe(2);
  }, 60_000);

  it("does not repeat a completed node when projection delivery is retried", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const projectionStarted = deferred();
    const appliedKeys = new Set<string>();
    let executions = 0;
    let projectionAttempts = 0;
    let projectionEffects = 0;
    const executor: NodeExecutor = {
      execute: async (item) => {
        executions += 1;
        return output(item);
      }
    };
    const sink: NodeProjectionSink = {
      record: async (item: NodeProjectionRequest, signal) => {
        projectionAttempts += 1;
        if (!appliedKeys.has(item.eventKey)) {
          appliedKeys.add(item.eventKey);
          projectionEffects += 1;
        }
        if (projectionAttempts > 1) return;
        projectionStarted.resolve();
        await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
    };
    const firstWorker = await workerFor(environment, taskQueue, executor, sink);
    const firstRun = firstWorker.run();
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    const handle = await runtime.start(request(workflow([node("project")])));
    await projectionStarted.promise;
    firstWorker.shutdown();
    await firstRun;

    const secondWorker = await workerFor(environment, taskQueue, executor, sink);
    await secondWorker.runUntil(() => handle.result());
    expect(executions).toBe(1);
    expect(projectionAttempts).toBe(2);
    expect(projectionEffects).toBe(1);
  }, 60_000);

  it("passes a stable idempotency key across duplicate side-effect delivery", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const appliedKeys = new Set<string>();
    let attempts = 0;
    let effects = 0;
    let observedKey: string | undefined;
    const executor: NodeExecutor = {
      execute: async (item) => {
        attempts += 1;
        observedKey ??= item.idempotencyKey;
        expect(item.idempotencyKey).toBe(observedKey);
        if (item.idempotencyKey !== undefined && !appliedKeys.has(item.idempotencyKey)) {
          appliedKeys.add(item.idempotencyKey);
          effects += 1;
        }
        if (attempts === 1) throw new RuntimeNodeError("TRANSIENT", "completion lost");
        return output(item);
      }
    };
    const worker = await workerFor(environment, taskQueue, executor);
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    await worker.runUntil(async () => {
      const handle = await runtime.start(
        request(
          workflow([
            node("publish", "side_effect", {
              retryPolicy: { retryableClasses: ["TRANSIENT"], backoff: "fixed" }
            })
          ])
        )
      );
      return handle.result();
    });
    expect(attempts).toBe(2);
    expect(effects).toBe(1);
    expect(observedKey).toContain(":publish:publish");
  }, 60_000);

  it("replays completed history with the current workflow bundle", async () => {
    const taskQueue = `awf-${randomUUID()}`;
    const runId = randomUUID();
    const executor: NodeExecutor = { execute: async (item) => output(item) };
    const worker = await workerFor(environment, taskQueue, executor);
    const runtime = new TemporalRuntimePort(environment.client, taskQueue);
    await worker.runUntil(async () => {
      const handle = await runtime.start(request(workflow([node("replay")]), runId));
      return handle.result();
    });
    const history = await environment.client.workflow
      .getHandle(temporalWorkflowId("tenant-a", runId))
      .fetchHistory();
    await expect(
      Worker.runReplayHistory({ workflowsPath }, history, runId)
    ).resolves.toBeUndefined();
  }, 60_000);
});
