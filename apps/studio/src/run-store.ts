import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalize, digestWorkflow, type WorkflowDefinition } from "@awf/ir";
import {
  simulateDeterministic,
  validateFixtureInput,
  type SimulationTrace,
  type StoredRunEvent
} from "@awf/runtime-core";
import type { StudioDemoRecord } from "./demo-store.js";
import type {
  ExecutedStep,
  StudioExecutionProgressEvent,
  StudioWorkflowExecutor
} from "./executor.js";

export type StudioRunStatus = "running" | "completed" | "failed";
export type StudioNodeStatus = "waiting" | "scheduled" | "running" | "completed" | "failed";

export interface StudioArtifactRecord {
  artifactId: string;
  nodeId: string;
  port: string;
  contentHash: string;
  source?: "file" | "stdout" | "simulation";
  path?: string;
}

export interface StudioRunMetrics {
  timing: {
    workflowDurationMs: number;
    inputValidationMs?: number;
    deterministicSimulationMs?: number;
    actualExecutionMs?: number;
    resultBuild: {
      kind: "snapshot_materialization";
      status: "measured" | "not_applicable";
      durationMs: number;
    };
  };
  tokens: {
    status: "measured" | "not_reported";
    source: "runtime_events" | "executor_protocol";
    coverage?: "complete" | "partial" | "none";
    modelInvocations: number;
    inputTokens: number;
    cachedInputTokens?: number;
    outputTokens: number;
    reasoningOutputTokens?: number;
    totalTokens: number;
  };
  trace: {
    traceId: string;
    eventCount: number;
    workflowDigest: string;
    inputDigest: string;
    traceDigest?: string;
  };
}

export interface StudioRunRecord {
  schemaVersion: "awf/studio-run/v1";
  runId: string;
  tenantId: "local-studio";
  workflowId: string;
  workflowVersion: string;
  workflowDigest: string;
  executionMode: "DETERMINISTIC_SIMULATION" | "LOCAL_PROCESS";
  status: StudioRunStatus;
  createdAt: string;
  completedAt: string;
  inputDigest: string;
  traceDigest?: string;
  events: StoredRunEvent[];
  nodeStates: Record<string, StudioNodeStatus>;
  artifacts: StudioArtifactRecord[];
  metrics?: StudioRunMetrics;
  demo?: StudioDemoRecord;
  outputs?: Record<string, unknown>;
  executor?: {
    kind: "local-process";
    workingDirectory: string;
    executionDirectory: string;
    inputPath: string;
    stepCount: number;
  };
  error?: { name: string; message: string };
}

export interface StudioRunSummary {
  runId: string;
  workflowId: string;
  workflowVersion: string;
  executionMode: StudioRunRecord["executionMode"];
  status: StudioRunStatus;
  createdAt: string;
  completedAt: string;
  eventCount: number;
  artifactCount: number;
  demo?: StudioDemoRecord;
}

export interface StudioRunStore {
  append(record: StudioRunRecord): Promise<void>;
  get(runId: string): Promise<StudioRunRecord | undefined>;
  list(): Promise<StudioRunSummary[]>;
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function roundMilliseconds(value: number): number {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

function snapshot<T>(value: T): T {
  return JSON.parse(canonicalize(value)) as T;
}

function summarize(record: StudioRunRecord): StudioRunSummary {
  return {
    runId: record.runId,
    workflowId: record.workflowId,
    workflowVersion: record.workflowVersion,
    executionMode: record.executionMode,
    status: record.status,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    eventCount: record.events.length,
    artifactCount: record.artifacts.length,
    ...(record.demo === undefined ? {} : { demo: record.demo })
  };
}

function sortSummaries(records: StudioRunRecord[]): StudioRunSummary[] {
  return records
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || utf16(right.runId, left.runId)
    )
    .map(summarize);
}

export class InMemoryStudioRunStore implements StudioRunStore {
  private readonly records = new Map<string, StudioRunRecord>();

  async append(record: StudioRunRecord): Promise<void> {
    this.records.set(record.runId, snapshot(record));
  }

  async get(runId: string): Promise<StudioRunRecord | undefined> {
    const record = this.records.get(runId);
    return record === undefined ? undefined : snapshot(record);
  }

  async list(): Promise<StudioRunSummary[]> {
    return sortSummaries([...this.records.values()]);
  }
}

export class JsonlStudioRunStore implements StudioRunStore {
  constructor(private readonly path: string) {}

  private async records(): Promise<StudioRunRecord[]> {
    let source: string;
    try {
      source = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return source
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, index) => {
        const record = JSON.parse(line) as StudioRunRecord;
        if (record.schemaVersion !== "awf/studio-run/v1" || record.runId.length === 0) {
          throw new Error(`invalid studio run record at line ${index + 1}`);
        }
        return record;
      });
  }

  async append(record: StudioRunRecord): Promise<void> {
    const rootDirectory = dirname(this.path);
    const runDirectory = join(rootDirectory, record.runId);
    await mkdir(runDirectory, { recursive: true });
    await appendFile(this.path, `${canonicalize(record)}\n`, { encoding: "utf8", mode: 0o600 });
    const temporaryPath = join(runDirectory, `.run-${randomUUID()}.tmp`);
    await writeFile(temporaryPath, `${canonicalize(record)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(temporaryPath, join(runDirectory, "run.json"));
  }

  async get(runId: string): Promise<StudioRunRecord | undefined> {
    const record = (await this.records()).findLast((item) => item.runId === runId);
    return record === undefined ? undefined : snapshot(record);
  }

  async list(): Promise<StudioRunSummary[]> {
    const latest = new Map<string, StudioRunRecord>();
    for (const record of await this.records()) latest.set(record.runId, record);
    return sortSummaries([...latest.values()]);
  }
}

function materializeTrace(input: {
  workflow: WorkflowDefinition;
  trace: SimulationTrace;
  runId: string;
  createdAt: string;
  completedAt: string;
  completedElapsedMs: number;
  inputDigest: string;
  traceEventTimings: Array<{ occurredAt: string; elapsedMs: number }>;
  metrics: StudioRunMetrics;
  demo?: StudioDemoRecord;
}): StudioRunRecord {
  const events: StoredRunEvent[] = [];
  const artifacts: StudioArtifactRecord[] = [];
  const nodeStates = Object.fromEntries(
    input.workflow.nodes.map((node) => [node.id, "waiting" as StudioNodeStatus])
  );
  const add = (
    type: StoredRunEvent["type"],
    occurredAt: string,
    elapsedMs: number,
    payload: unknown
  ): void => {
    const sequence = events.length + 1;
    events.push({
      tenantId: "local-studio",
      runId: input.runId,
      eventKey: `${input.runId}:${sequence}`,
      sequence,
      type,
      occurredAt,
      elapsedMs,
      payload
    });
  };
  add("RunCreated", input.createdAt, 0, {
    executionMode: "DETERMINISTIC_SIMULATION",
    workflowDigest: digestWorkflow(input.workflow),
    inputDigest: input.inputDigest
  });
  const nodeStartedAt = new Map<string, number>();
  for (const [traceIndex, traceEvent] of input.trace.events.entries()) {
    const timing = input.traceEventTimings[traceIndex] ?? {
      occurredAt: input.createdAt,
      elapsedMs: 0
    };
    if (traceEvent.type === "nodeStarted") {
      nodeStartedAt.set(traceEvent.nodeId, timing.elapsedMs);
      nodeStates[traceEvent.nodeId] = "scheduled";
      add("NodeScheduled", timing.occurredAt, timing.elapsedMs, { nodeId: traceEvent.nodeId });
      nodeStates[traceEvent.nodeId] = "running";
      add("NodeStarted", timing.occurredAt, timing.elapsedMs, {
        nodeId: traceEvent.nodeId,
        inputDigests: traceEvent.inputDigests,
        ...(traceEvent.round === undefined ? {} : { round: traceEvent.round })
      });
    }
    if (traceEvent.type === "sideEffectSkipped") {
      add("SideEffectPrepared", timing.occurredAt, timing.elapsedMs, {
        nodeId: traceEvent.nodeId,
        operation: traceEvent.operation,
        skipped: true
      });
    }
    if (traceEvent.type === "nodeCompleted") {
      for (const [port, contentHash] of Object.entries(traceEvent.outputDigests).sort(
        ([left], [right]) => utf16(left, right)
      )) {
        const artifact = {
          artifactId: `sim_${contentHash}`,
          nodeId: traceEvent.nodeId,
          port,
          contentHash
        };
        artifacts.push(artifact);
        add("ArtifactPublished", timing.occurredAt, timing.elapsedMs, artifact);
      }
      nodeStates[traceEvent.nodeId] = "completed";
      add("NodeCompleted", timing.occurredAt, timing.elapsedMs, {
        nodeId: traceEvent.nodeId,
        durationMs: roundMilliseconds(
          timing.elapsedMs - (nodeStartedAt.get(traceEvent.nodeId) ?? 0)
        ),
        outputDigests: traceEvent.outputDigests
      });
    }
  }
  add("RunCompleted", input.completedAt, input.completedElapsedMs, {
    durationMs: input.completedElapsedMs,
    traceDigest: input.trace.digest,
    outputDigest: digestWorkflow(input.trace.outputs)
  });
  return snapshot({
    schemaVersion: "awf/studio-run/v1" as const,
    runId: input.runId,
    tenantId: "local-studio" as const,
    workflowId: input.workflow.id,
    workflowVersion: input.workflow.version,
    workflowDigest: digestWorkflow(input.workflow),
    executionMode: "DETERMINISTIC_SIMULATION" as const,
    status: "completed" as const,
    createdAt: input.createdAt,
    completedAt: input.completedAt,
    inputDigest: input.inputDigest,
    traceDigest: input.trace.digest,
    events,
    nodeStates,
    artifacts,
    metrics: {
      ...input.metrics,
      trace: { ...input.metrics.trace, eventCount: events.length }
    },
    ...(input.demo === undefined ? {} : { demo: input.demo }),
    outputs: input.trace.outputs
  });
}

export async function executeStudioRun(input: {
  workflow: WorkflowDefinition;
  inputs: unknown;
  store: StudioRunStore;
  runId?: string;
  now?: () => string;
  monotonicNow?: () => number;
  createDemoSnapshot?: (runId: string) => Promise<StudioDemoRecord | undefined>;
}): Promise<StudioRunRecord> {
  const runId = input.runId ?? `run_${randomUUID()}`;
  const now = input.now ?? (() => new Date().toISOString());
  const monotonicNow = input.monotonicNow ?? (() => performance.now());
  const monotonicStartedAt = monotonicNow();
  const elapsed = (): number => roundMilliseconds(monotonicNow() - monotonicStartedAt);
  const occurredAt = (elapsedMs: number): string =>
    new Date(new Date(createdAt).getTime() + elapsedMs).toISOString();
  const createdAt = now();
  const inputDigest = digestWorkflow(input.inputs);
  try {
    const validationStartedAt = monotonicNow();
    const fixture = validateFixtureInput(input.workflow, input.inputs);
    const inputValidationMs = roundMilliseconds(monotonicNow() - validationStartedAt);
    const traceEventTimings: Array<{ occurredAt: string; elapsedMs: number }> = [];
    const simulationStartedAt = monotonicNow();
    const trace = simulateDeterministic(input.workflow, fixture, {
      onEvent: () => {
        const elapsedMs = elapsed();
        traceEventTimings.push({ occurredAt: occurredAt(elapsedMs), elapsedMs });
      }
    });
    const deterministicSimulationMs = roundMilliseconds(monotonicNow() - simulationStartedAt);
    const resultBuildStartedAt = monotonicNow();
    const demo = await input.createDemoSnapshot?.(runId);
    const resultBuildDurationMs = roundMilliseconds(monotonicNow() - resultBuildStartedAt);
    const completedElapsedMs = elapsed();
    const workflowDigest = digestWorkflow(input.workflow);
    const record = materializeTrace({
      workflow: input.workflow,
      trace,
      runId,
      createdAt,
      completedAt: now(),
      completedElapsedMs,
      inputDigest,
      traceEventTimings,
      metrics: {
        timing: {
          workflowDurationMs: completedElapsedMs,
          inputValidationMs,
          deterministicSimulationMs,
          resultBuild: {
            kind: "snapshot_materialization",
            status: input.createDemoSnapshot === undefined ? "not_applicable" : "measured",
            durationMs: input.createDemoSnapshot === undefined ? 0 : resultBuildDurationMs
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
          traceId: runId,
          eventCount: 0,
          workflowDigest,
          inputDigest,
          traceDigest: trace.digest
        }
      },
      ...(demo === undefined ? {} : { demo })
    });
    await input.store.append(record);
    return record;
  } catch (error) {
    const completedAt = now();
    const completedElapsedMs = elapsed();
    const events: StoredRunEvent[] = [
      {
        tenantId: "local-studio",
        runId,
        eventKey: `${runId}:1`,
        sequence: 1,
        type: "RunCreated",
        occurredAt: createdAt,
        elapsedMs: 0,
        payload: { executionMode: "DETERMINISTIC_SIMULATION", inputDigest }
      },
      {
        tenantId: "local-studio",
        runId,
        eventKey: `${runId}:2`,
        sequence: 2,
        type: "RunFailed",
        occurredAt: completedAt,
        elapsedMs: completedElapsedMs,
        payload: {
          durationMs: completedElapsedMs,
          errorName: (error as Error).name,
          message: (error as Error).message
        }
      }
    ];
    const record: StudioRunRecord = snapshot({
      schemaVersion: "awf/studio-run/v1",
      runId,
      tenantId: "local-studio",
      workflowId: input.workflow.id,
      workflowVersion: input.workflow.version,
      workflowDigest: digestWorkflow(input.workflow),
      executionMode: "DETERMINISTIC_SIMULATION",
      status: "failed",
      createdAt,
      completedAt,
      inputDigest,
      events,
      nodeStates: Object.fromEntries(
        input.workflow.nodes.map((node) => [node.id, "waiting" as StudioNodeStatus])
      ),
      artifacts: [],
      metrics: {
        timing: {
          workflowDurationMs: completedElapsedMs,
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
          traceId: runId,
          eventCount: events.length,
          workflowDigest: digestWorkflow(input.workflow),
          inputDigest
        }
      },
      error: { name: (error as Error).name, message: (error as Error).message }
    });
    await input.store.append(record);
    return record;
  }
}

export async function executeStudioProcessRun(input: {
  workflow: WorkflowDefinition;
  inputs: unknown;
  store: StudioRunStore;
  executor: StudioWorkflowExecutor;
  runId?: string;
  now?: () => string;
  monotonicNow?: () => number;
  onStarted?: (record: StudioRunRecord) => void | Promise<void>;
  createDemoSnapshot?: (runId: string) => Promise<StudioDemoRecord | undefined>;
}): Promise<StudioRunRecord> {
  const runId = input.runId ?? `run_${randomUUID()}`;
  const now = input.now ?? (() => new Date().toISOString());
  const monotonicNow = input.monotonicNow ?? (() => performance.now());
  const monotonicStartedAt = monotonicNow();
  const elapsed = (): number => roundMilliseconds(monotonicNow() - monotonicStartedAt);
  const createdAt = now();
  const occurredAt = (elapsedMs: number): string =>
    new Date(new Date(createdAt).getTime() + elapsedMs).toISOString();
  const inputDigest = digestWorkflow(input.inputs);
  const workflowDigest = digestWorkflow(input.workflow);
  const events: StoredRunEvent[] = [];
  const artifacts: StudioArtifactRecord[] = [];
  const nodeStates = Object.fromEntries(
    input.workflow.nodes.map((node) => [node.id, "waiting" as StudioNodeStatus])
  );
  const add = (type: StoredRunEvent["type"], elapsedMs: number, payload: unknown): void => {
    const sequence = events.length + 1;
    events.push({
      tenantId: "local-studio",
      runId,
      eventKey: `${runId}:${sequence}`,
      sequence,
      type,
      occurredAt: occurredAt(elapsedMs),
      elapsedMs,
      payload
    });
  };
  add("RunCreated", 0, {
    executionMode: "LOCAL_PROCESS",
    workflowDigest,
    inputDigest,
    executor: {
      kind: input.executor.descriptor.kind,
      workingDirectory: input.executor.descriptor.workingDirectory,
      steps: input.executor.descriptor.steps.map((step) => ({
        nodeId: step.nodeId,
        command: step.command,
        tokenTracking: step.tokenTracking
      }))
    }
  });
  let inputValidationMs: number | undefined;
  let actualExecutionMs: number | undefined;
  let resultBuildDurationMs = 0;
  let demo: StudioDemoRecord | undefined;
  let executionDirectory = "";
  let executionInputPath = "";
  const usageTotals = {
    modelInvocations: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0
  };
  const usageNodeIds = new Set<string>();
  const nodeById = new Map(input.workflow.nodes.map((node) => [node.id, node]));
  const tokenCoverage = (): "complete" | "partial" | "none" => {
    const trackedNodeIds = input.executor.descriptor.steps
      // Optional telemetry is collected when present but cannot make a run incomplete.
      // Only nodes declared `required` participate in the coverage gate.
      .filter((step) => step.tokenTracking === "required")
      .map((step) => step.nodeId);
    const trackedNodesReported = trackedNodeIds.filter((nodeId) => usageNodeIds.has(nodeId)).length;
    return trackedNodeIds.length === 0 || trackedNodesReported === trackedNodeIds.length
      ? "complete"
      : trackedNodesReported === 0
        ? "none"
        : "partial";
  };
  const recordUsage = (
    step: Pick<ExecutedStep, "nodeId" | "usage" | "durationMs">,
    completedElapsed: number
  ): void => {
    if (step.usage.length > 0) usageNodeIds.add(step.nodeId);
    for (const sample of step.usage) {
      usageTotals.modelInvocations += 1;
      usageTotals.inputTokens += sample.inputTokens;
      usageTotals.cachedInputTokens += sample.cachedInputTokens;
      usageTotals.outputTokens += sample.outputTokens;
      usageTotals.reasoningOutputTokens += sample.reasoningOutputTokens;
      add("ModelCompleted", completedElapsed, {
        nodeId: step.nodeId,
        provider: sample.provider,
        ...(sample.model === undefined ? {} : { model: sample.model }),
        durationMs: step.durationMs,
        usage: {
          inputTokens: sample.inputTokens,
          cachedInputTokens: sample.cachedInputTokens,
          outputTokens: sample.outputTokens,
          reasoningOutputTokens: sample.reasoningOutputTokens
        }
      });
    }
  };
  const materializeCompletedStep = (step: ExecutedStep, executorStartedElapsed: number): void => {
    const completedElapsed = roundMilliseconds(
      executorStartedElapsed + step.startedOffsetMs + step.durationMs
    );
    recordUsage(step, completedElapsed);
    const outputDigests: Record<string, string> = {};
    for (const artifact of step.artifacts) {
      outputDigests[artifact.port] = artifact.contentHash;
      const record: StudioArtifactRecord = {
        artifactId: `artifact_${artifact.contentHash}`,
        nodeId: artifact.nodeId,
        port: artifact.port,
        contentHash: artifact.contentHash,
        source: artifact.source,
        ...(artifact.path === undefined ? {} : { path: artifact.path })
      };
      artifacts.push(record);
      add("ArtifactPublished", completedElapsed, record);
    }
    if (nodeById.get(step.nodeId)?.kind === "judge") {
      add("VerifierCompleted", completedElapsed, {
        nodeId: step.nodeId,
        durationMs: step.durationMs,
        exitCode: step.exitCode
      });
    }
    nodeStates[step.nodeId] = "completed";
    add("NodeCompleted", completedElapsed, {
      nodeId: step.nodeId,
      durationMs: step.durationMs,
      exitCode: step.exitCode,
      outputDigests,
      stdoutPath: step.stdoutPath,
      stderrPath: step.stderrPath,
      stdoutBytes: Buffer.byteLength(step.stdout),
      stderrBytes: Buffer.byteLength(step.stderr)
    });
  };
  const persistRunning = async (): Promise<StudioRunRecord> => {
    const coverage = tokenCoverage();
    const runningRecord: StudioRunRecord = snapshot({
      schemaVersion: "awf/studio-run/v1",
      runId,
      tenantId: "local-studio",
      workflowId: input.workflow.id,
      workflowVersion: input.workflow.version,
      workflowDigest,
      executionMode: "LOCAL_PROCESS",
      status: "running",
      createdAt,
      completedAt: now(),
      inputDigest,
      events,
      nodeStates,
      artifacts,
      metrics: {
        timing: {
          workflowDurationMs: elapsed(),
          ...(inputValidationMs === undefined ? {} : { inputValidationMs }),
          resultBuild: {
            kind: "snapshot_materialization",
            status: "not_applicable",
            durationMs: 0
          }
        },
        tokens: {
          status: coverage === "complete" ? "measured" : "not_reported",
          source: "executor_protocol",
          coverage,
          ...usageTotals,
          totalTokens: usageTotals.inputTokens + usageTotals.outputTokens
        },
        trace: {
          traceId: runId,
          eventCount: events.length,
          workflowDigest,
          inputDigest
        }
      },
      ...(executionDirectory.length === 0
        ? {}
        : {
            executor: {
              kind: "local-process",
              workingDirectory: input.executor.descriptor.workingDirectory,
              executionDirectory,
              inputPath: executionInputPath,
              stepCount: Object.values(nodeStates).filter((state) => state === "completed").length
            }
          })
    });
    await input.store.append(runningRecord);
    return runningRecord;
  };
  try {
    const validationStartedAt = monotonicNow();
    const fixture = validateFixtureInput(input.workflow, input.inputs);
    inputValidationMs = roundMilliseconds(monotonicNow() - validationStartedAt);
    const executorStartedElapsed = elapsed();
    const startedRecord = await persistRunning();
    await input.onStarted?.(startedRecord);
    const execution = await input.executor.execute({
      workflow: input.workflow,
      inputs: fixture,
      runId,
      onProgress: async (event: StudioExecutionProgressEvent) => {
        if (event.type === "executionPrepared") {
          executionDirectory = event.executionDirectory;
          executionInputPath = event.inputPath;
        }
        if (event.type === "stepStarted") {
          const startedElapsed = roundMilliseconds(executorStartedElapsed + event.startedOffsetMs);
          nodeStates[event.nodeId] = "scheduled";
          add("NodeScheduled", startedElapsed, {
            nodeId: event.nodeId,
            command: event.command,
            workingDirectory: event.workingDirectory
          });
          nodeStates[event.nodeId] = "running";
          add("NodeStarted", startedElapsed, {
            nodeId: event.nodeId,
            command: event.command,
            workingDirectory: event.workingDirectory,
            inputPath: executionInputPath
          });
          const nodeKind = nodeById.get(event.nodeId)?.kind;
          if (nodeKind === "llm") {
            add("ModelInvoked", startedElapsed, {
              nodeId: event.nodeId,
              tokenTracking:
                input.executor.descriptor.steps.find((step) => step.nodeId === event.nodeId)
                  ?.tokenTracking ?? "optional"
            });
          }
          if (nodeKind === "judge") {
            add("VerifierStarted", startedElapsed, { nodeId: event.nodeId });
          }
        }
        if (event.type === "stepCompleted") {
          materializeCompletedStep(event.step, executorStartedElapsed);
        }
        if (event.type === "stepFailed") {
          const failedElapsed = elapsed();
          recordUsage(
            { nodeId: event.nodeId, usage: event.usage, durationMs: event.durationMs },
            failedElapsed
          );
          nodeStates[event.nodeId] = "failed";
          add("NodeFailed", failedElapsed, {
            nodeId: event.nodeId,
            durationMs: event.durationMs,
            exitCode: event.exitCode,
            errorCode: event.errorCode,
            message: event.message,
            stdoutPath: event.stdoutPath,
            stderrPath: event.stderrPath
          });
        }
        await persistRunning();
      }
    });
    actualExecutionMs = execution.durationMs;
    executionDirectory = execution.executionDirectory;
    executionInputPath = execution.inputPath;
    for (const step of execution.steps) {
      if (nodeStates[step.nodeId] !== "completed") {
        materializeCompletedStep(step, executorStartedElapsed);
      }
    }
    const resultBuildStartedAt = monotonicNow();
    demo = await input.createDemoSnapshot?.(runId);
    resultBuildDurationMs = roundMilliseconds(monotonicNow() - resultBuildStartedAt);
    const completedElapsedMs = elapsed();
    const traceDigest = digestWorkflow({
      runId,
      workflowDigest,
      inputDigest,
      events: events.map(({ type, elapsedMs, payload }) => ({ type, elapsedMs, payload })),
      outputs: execution.outputs
    });
    add("RunCompleted", completedElapsedMs, {
      durationMs: completedElapsedMs,
      actualExecutionMs,
      snapshotMaterializationMs: resultBuildDurationMs,
      traceDigest,
      outputDigest: digestWorkflow(execution.outputs)
    });
    const completedTokenCoverage = tokenCoverage();
    const record: StudioRunRecord = snapshot({
      schemaVersion: "awf/studio-run/v1",
      runId,
      tenantId: "local-studio",
      workflowId: input.workflow.id,
      workflowVersion: input.workflow.version,
      workflowDigest,
      executionMode: "LOCAL_PROCESS",
      status: "completed",
      createdAt,
      completedAt: now(),
      inputDigest,
      traceDigest,
      events,
      nodeStates,
      artifacts,
      metrics: {
        timing: {
          workflowDurationMs: completedElapsedMs,
          inputValidationMs,
          actualExecutionMs,
          resultBuild: {
            kind: "snapshot_materialization",
            status: input.createDemoSnapshot === undefined ? "not_applicable" : "measured",
            durationMs: input.createDemoSnapshot === undefined ? 0 : resultBuildDurationMs
          }
        },
        tokens: {
          status: completedTokenCoverage === "complete" ? "measured" : "not_reported",
          source: "executor_protocol",
          coverage: completedTokenCoverage,
          ...usageTotals,
          totalTokens: usageTotals.inputTokens + usageTotals.outputTokens
        },
        trace: {
          traceId: runId,
          eventCount: events.length,
          workflowDigest,
          inputDigest,
          traceDigest
        }
      },
      executor: {
        kind: "local-process",
        workingDirectory: input.executor.descriptor.workingDirectory,
        executionDirectory,
        inputPath: executionInputPath,
        stepCount: execution.steps.length
      },
      ...(demo === undefined ? {} : { demo }),
      outputs: execution.outputs
    });
    await input.store.append(record);
    return record;
  } catch (error) {
    const failedElapsed = elapsed();
    const activeNode = Object.entries(nodeStates).find(([, state]) => state === "running")?.[0];
    if (activeNode !== undefined) {
      nodeStates[activeNode] = "failed";
      add("NodeFailed", failedElapsed, {
        nodeId: activeNode,
        errorName: (error as Error).name,
        message: (error as Error).message
      });
    }
    add("RunFailed", failedElapsed, {
      durationMs: failedElapsed,
      errorName: (error as Error).name,
      message: (error as Error).message
    });
    if (input.createDemoSnapshot !== undefined) {
      const resultBuildStartedAt = monotonicNow();
      try {
        demo = await input.createDemoSnapshot(runId);
      } catch {
        // Preserve the workflow failure as the primary error when no inspectable candidate exists.
        demo = undefined;
      }
      resultBuildDurationMs = roundMilliseconds(monotonicNow() - resultBuildStartedAt);
    }
    const record: StudioRunRecord = snapshot({
      schemaVersion: "awf/studio-run/v1",
      runId,
      tenantId: "local-studio",
      workflowId: input.workflow.id,
      workflowVersion: input.workflow.version,
      workflowDigest,
      executionMode: "LOCAL_PROCESS",
      status: "failed",
      createdAt,
      completedAt: now(),
      inputDigest,
      events,
      nodeStates,
      artifacts,
      metrics: {
        timing: {
          workflowDurationMs: failedElapsed,
          ...(inputValidationMs === undefined ? {} : { inputValidationMs }),
          ...(actualExecutionMs === undefined ? {} : { actualExecutionMs }),
          resultBuild: {
            kind: "snapshot_materialization",
            status: demo === undefined ? "not_applicable" : "measured",
            durationMs: demo === undefined ? 0 : resultBuildDurationMs
          }
        },
        tokens: {
          status: usageTotals.modelInvocations === 0 ? "not_reported" : "measured",
          source: "executor_protocol",
          coverage: usageTotals.modelInvocations === 0 ? "none" : "partial",
          ...usageTotals,
          totalTokens: usageTotals.inputTokens + usageTotals.outputTokens
        },
        trace: {
          traceId: runId,
          eventCount: events.length,
          workflowDigest,
          inputDigest
        }
      },
      ...(executionDirectory.length === 0
        ? {}
        : {
            executor: {
              kind: "local-process",
              workingDirectory: input.executor.descriptor.workingDirectory,
              executionDirectory,
              inputPath: executionInputPath,
              stepCount: Object.values(nodeStates).filter((state) => state === "completed").length
            }
          }),
      ...(demo === undefined ? {} : { demo }),
      error: { name: (error as Error).name, message: (error as Error).message }
    });
    await input.store.append(record);
    return record;
  }
}
