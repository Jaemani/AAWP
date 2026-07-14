import { canonicalize, digestWorkflow, type WorkflowDefinition } from "@awf/ir";
import { Ajv2020 } from "ajv/dist/2020.js";

export {
  DuplicateEventKeyError,
  EventSequenceConflictError,
  EventTenantBoundaryError,
  InMemoryRunEventStore,
  rebuildProjection,
  type AppendRunEvent,
  type RunEventStore,
  type RunEventType,
  type StoredRunEvent
} from "./events.js";
export {
  RUNTIME_ERROR_CLASSES,
  RuntimeNodeError,
  type NodeExecutionRequest,
  type NodeExecutor,
  type NodeProjectionRequest,
  type NodeProjectionSink,
  type RuntimeErrorClass,
  type RuntimeNodeControl,
  type RuntimePort,
  type RuntimeRunHandle,
  type RuntimeStartRequest
} from "./runtime-port.js";

export interface SimulationTrace {
  workflowId: string;
  workflowVersion: string;
  digest: string;
  events: SimulationEvent[];
  outputs: Record<string, unknown>;
}

export interface RuntimeDiagnostic {
  code: string;
  path: string;
  message: string;
  details?: unknown;
}

export class FixtureValidationError extends Error {
  readonly code = "INVALID_FIXTURE";

  constructor(readonly diagnostics: RuntimeDiagnostic[]) {
    super("invalid fixture");
    this.name = "FixtureValidationError";
  }
}

export class SimulationError extends Error {
  readonly code = "SIMULATION_ERROR";

  constructor(
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "SimulationError";
  }
}

export type SimulationEvent =
  | { type: "workflowInput"; port: string; valueDigest: string }
  | { type: "nodeStarted"; nodeId: string; round?: number; inputDigests: Record<string, string> }
  | { type: "sideEffectSkipped"; nodeId: string; operation: string }
  | { type: "nodeCompleted"; nodeId: string; outputDigests: Record<string, string> }
  | { type: "workflowOutput"; port: string; valueDigest: string };

function valueDigest(value: unknown): string {
  return digestWorkflow(value);
}

function sortedEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort(([a], [b]) => compareUtf16(a, b));
}

function compareUtf16(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function portKey(ref: { type: string; schemaVersion: string }): string {
  return `${ref.type}@${ref.schemaVersion}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateFixtureInput(
  workflow: WorkflowDefinition,
  fixtureInput: unknown
): Record<string, unknown> {
  const diagnostics: RuntimeDiagnostic[] = [];
  if (!isRecord(fixtureInput)) {
    throw new FixtureValidationError([
      { code: "INVALID_FIXTURE", path: "/", message: "fixture must be a JSON object" }
    ]);
  }

  const expectedPorts = Object.keys(workflow.inputs).sort(compareUtf16);
  const actualPorts = Object.keys(fixtureInput).sort(compareUtf16);
  for (const port of expectedPorts) {
    if (!Object.hasOwn(fixtureInput, port)) {
      diagnostics.push({
        code: "INVALID_FIXTURE",
        path: `/${port}`,
        message: `missing fixture input ${port}`
      });
    }
  }
  for (const port of actualPorts) {
    if (!Object.hasOwn(workflow.inputs, port)) {
      diagnostics.push({
        code: "INVALID_FIXTURE",
        path: `/${port}`,
        message: `extra fixture input ${port}`
      });
    }
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schemas = new Map(
    workflow.artifactSchemas.map((schema) => [portKey(schema), schema.schema])
  );
  for (const port of expectedPorts) {
    const ref = workflow.inputs[port];
    if (ref === undefined || !Object.hasOwn(fixtureInput, port)) continue;
    const schema = schemas.get(portKey(ref));
    if (schema === undefined) {
      diagnostics.push({
        code: "INVALID_FIXTURE",
        path: `/${port}`,
        message: `missing artifact schema ${portKey(ref)}`
      });
      continue;
    }
    const validate = ajv.compile(schema);
    if (!validate(fixtureInput[port])) {
      diagnostics.push({
        code: "INVALID_FIXTURE",
        path: `/${port}`,
        message: `fixture input ${port} does not match ${portKey(ref)}`,
        details: { errors: validate.errors }
      });
    }
  }

  if (diagnostics.length > 0) {
    throw new FixtureValidationError(diagnostics);
  }
  return fixtureInput;
}

export function simulateDeterministic(
  workflow: WorkflowDefinition,
  fixtureInput: Record<string, unknown>
): SimulationTrace {
  const events: SimulationEvent[] = [];
  const nodeOutputs = new Map<string, Record<string, unknown>>();
  const outputs: Record<string, unknown> = {};
  for (const [port, value] of sortedEntries(fixtureInput)) {
    events.push({ type: "workflowInput", port, valueDigest: valueDigest(value) });
  }

  const remaining = new Set(workflow.nodes.map((node) => node.id));
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const sortedNodes = [...workflow.nodes].sort((a, b) => compareUtf16(a.id, b.id));
  const sortedEdges = [...workflow.edges].sort((a, b) => {
    const targetPort =
      "port" in a.target && "port" in b.target ? compareUtf16(a.target.port, b.target.port) : 0;
    if (targetPort !== 0) return targetPort;
    const leftSource =
      a.source.kind === "nodeOutput" ? `${a.source.nodeId}/${a.source.port}` : `/${a.source.port}`;
    const rightSource =
      b.source.kind === "nodeOutput" ? `${b.source.nodeId}/${b.source.port}` : `/${b.source.port}`;
    return compareUtf16(leftSource, rightSource);
  });
  let progressed = true;
  while (remaining.size > 0 && progressed) {
    progressed = false;
    for (const node of sortedNodes) {
      if (!remaining.has(node.id)) continue;
      const incoming = sortedEdges.filter(
        (edge) => edge.target.kind === "nodeInput" && edge.target.nodeId === node.id
      );
      if (
        incoming.some((edge) => {
          if (edge.source.kind === "workflowInput") return !(edge.source.port in fixtureInput);
          return !nodeOutputs.has(edge.source.nodeId);
        })
      ) {
        continue;
      }

      const inputs: Record<string, unknown> = {};
      for (const edge of incoming.sort((a, b) => compareUtf16(a.target.port, b.target.port))) {
        if (edge.target.kind !== "nodeInput") continue;
        inputs[edge.target.port] =
          edge.source.kind === "workflowInput"
            ? fixtureInput[edge.source.port]
            : nodeOutputs.get(edge.source.nodeId)?.[edge.source.port];
      }
      const rounds = node.kind === "loop" ? (node.loop?.maxRounds ?? 1) : 1;
      for (let round = 1; round <= rounds; round += 1) {
        events.push({
          type: "nodeStarted",
          nodeId: node.id,
          ...(node.kind === "loop" ? { round } : {}),
          inputDigests: Object.fromEntries(
            sortedEntries(inputs).map(([key, value]) => [key, valueDigest(value)])
          )
        });
      }
      if (node.kind === "side_effect") {
        events.push({
          type: "sideEffectSkipped",
          nodeId: node.id,
          operation: node.sideEffect?.operation ?? "unknown"
        });
      }
      const produced = Object.fromEntries(
        sortedEntries(node.outputs).map(([port, ref]) => [
          port,
          {
            nodeId: node.id,
            port,
            type: ref.type,
            schemaVersion: ref.schemaVersion,
            inputDigest: valueDigest(inputs),
            simulated: true
          }
        ])
      );
      nodeOutputs.set(node.id, produced);
      events.push({
        type: "nodeCompleted",
        nodeId: node.id,
        outputDigests: Object.fromEntries(
          sortedEntries(produced).map(([key, value]) => [key, valueDigest(value)])
        )
      });
      remaining.delete(node.id);
      progressed = true;
    }
  }

  if (remaining.size > 0) {
    throw new SimulationError("simulation stalled", {
      remainingNodeIds: [...remaining].sort(compareUtf16)
    });
  }

  for (const nodeId of nodeOutputs.keys()) {
    if (!nodeById.has(nodeId)) {
      throw new SimulationError("unknown node output", { nodeId });
    }
  }

  for (const [port] of sortedEntries(workflow.outputs)) {
    const edge = sortedEdges.find(
      (item) => item.target.kind === "workflowOutput" && item.target.port === port
    );
    if (edge === undefined) {
      throw new SimulationError("workflow output missing producer", { port });
    }
    const value =
      edge.source.kind === "workflowInput"
        ? fixtureInput[edge.source.port]
        : nodeOutputs.get(edge.source.nodeId)?.[edge.source.port];
    if (value === undefined) {
      throw new SimulationError("workflow output was not produced", { port });
    }
    outputs[edge.target.port] = value;
    events.push({
      type: "workflowOutput",
      port: edge.target.port,
      valueDigest: valueDigest(value)
    });
  }

  const traceWithoutDigest = {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    events,
    outputs
  };
  return {
    ...traceWithoutDigest,
    digest: digestWorkflow(traceWithoutDigest)
  };
}

export function stableTraceJson(trace: SimulationTrace): string {
  return `${canonicalize(trace)}\n`;
}
