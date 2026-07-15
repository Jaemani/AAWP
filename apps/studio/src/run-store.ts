import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalize, digestWorkflow, type WorkflowDefinition } from "@awf/ir";
import {
  simulateDeterministic,
  validateFixtureInput,
  type SimulationTrace,
  type StoredRunEvent
} from "@awf/runtime-core";
import type { StudioDemoRecord } from "./demo-store.js";

export type StudioRunStatus = "completed" | "failed";
export type StudioNodeStatus = "waiting" | "scheduled" | "running" | "completed" | "failed";

export interface StudioArtifactRecord {
  artifactId: string;
  nodeId: string;
  port: string;
  contentHash: string;
}

export interface StudioRunRecord {
  schemaVersion: "awf/studio-run/v1";
  runId: string;
  tenantId: "local-studio";
  workflowId: string;
  workflowVersion: string;
  workflowDigest: string;
  executionMode: "DETERMINISTIC_SIMULATION";
  status: StudioRunStatus;
  createdAt: string;
  completedAt: string;
  inputDigest: string;
  traceDigest?: string;
  events: StoredRunEvent[];
  nodeStates: Record<string, StudioNodeStatus>;
  artifacts: StudioArtifactRecord[];
  demo?: StudioDemoRecord;
  outputs?: Record<string, unknown>;
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
    if (this.records.has(record.runId))
      throw new Error(`studio run already exists: ${record.runId}`);
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
    if ((await this.get(record.runId)) !== undefined) {
      throw new Error(`studio run already exists: ${record.runId}`);
    }
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${canonicalize(record)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async get(runId: string): Promise<StudioRunRecord | undefined> {
    const record = (await this.records()).find((item) => item.runId === runId);
    return record === undefined ? undefined : snapshot(record);
  }

  async list(): Promise<StudioRunSummary[]> {
    return sortSummaries(await this.records());
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
    const fixture = validateFixtureInput(input.workflow, input.inputs);
    const traceEventTimings: Array<{ occurredAt: string; elapsedMs: number }> = [];
    const trace = simulateDeterministic(input.workflow, fixture, {
      onEvent: () => {
        const elapsedMs = elapsed();
        traceEventTimings.push({ occurredAt: occurredAt(elapsedMs), elapsedMs });
      }
    });
    const demo = await input.createDemoSnapshot?.(runId);
    const completedElapsedMs = elapsed();
    const record = materializeTrace({
      workflow: input.workflow,
      trace,
      runId,
      createdAt,
      completedAt: now(),
      completedElapsedMs,
      inputDigest,
      traceEventTimings,
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
      error: { name: (error as Error).name, message: (error as Error).message }
    });
    await input.store.append(record);
    return record;
  }
}
