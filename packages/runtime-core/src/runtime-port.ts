import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";

export const RUNTIME_ERROR_CLASSES = [
  "AUTHORIZATION",
  "VALIDATION",
  "CAPACITY",
  "TRANSIENT",
  "PROVIDER_TIMEOUT"
] as const;

export type RuntimeErrorClass = (typeof RUNTIME_ERROR_CLASSES)[number];

export interface RuntimeNodeControl {
  waitMs?: number;
}

export interface RuntimeStartRequest {
  tenantId: string;
  runId: string;
  workflow: WorkflowDefinition;
  inputs: Record<string, unknown>;
  nodeControls?: Record<string, RuntimeNodeControl>;
}

export interface RuntimeRunHandle<Result = unknown> {
  readonly runId: string;
  result(): Promise<Result>;
  signal(name: string, payload: unknown): Promise<void>;
  cancel(): Promise<void>;
}

export interface RuntimePort<Result = unknown> {
  readonly name: string;
  start(request: RuntimeStartRequest): Promise<RuntimeRunHandle<Result>>;
}

export interface NodeExecutionRequest {
  tenantId: string;
  runId: string;
  node: WorkflowNode;
  inputs: Record<string, unknown>;
  attempt: number;
  idempotencyKey?: string;
}

export interface NodeExecutor {
  execute(
    request: NodeExecutionRequest,
    cancellationSignal: AbortSignal
  ): Promise<Record<string, unknown>>;
}

export interface NodeProjectionRequest {
  tenantId: string;
  runId: string;
  nodeId: string;
  eventKey: string;
  outputs: Record<string, unknown>;
}

export interface NodeProjectionSink {
  record(request: NodeProjectionRequest, cancellationSignal: AbortSignal): Promise<void>;
}

export class RuntimeNodeError extends Error {
  constructor(
    readonly errorClass: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "RuntimeNodeError";
  }
}
