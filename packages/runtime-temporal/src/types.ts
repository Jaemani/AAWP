import type { WorkflowNode } from "@awf/ir";
import type { RuntimeStartRequest } from "@awf/runtime-core";

export const KNOWN_RUNTIME_ERROR_CLASSES = [
  "AUTHORIZATION",
  "VALIDATION",
  "CAPACITY",
  "TRANSIENT",
  "PROVIDER_TIMEOUT"
] as const;

export interface ApprovalSignalPayload {
  nodeId: string;
  approved: boolean;
  decidedBy: string;
  reason?: string;
}

export interface TemporalRunStatus {
  phase: "running" | "waiting_timer" | "waiting_approval" | "completed";
  currentNodeId: string | null;
  completedNodeIds: string[];
}

export interface TemporalRunResult {
  runId: string;
  workflowId: string;
  workflowVersion: string;
  completedNodeIds: string[];
  outputs: Record<string, unknown>;
}

export interface TemporalWorkflowInput extends RuntimeStartRequest {
  activityTaskQueue?: string;
}

export interface ExecuteNodeActivityInput {
  tenantId: string;
  runId: string;
  node: WorkflowNode;
  inputs: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ProjectNodeActivityInput {
  tenantId: string;
  runId: string;
  nodeId: string;
  eventKey: string;
  outputs: Record<string, unknown>;
}

export interface TemporalActivities {
  executeNode(input: ExecuteNodeActivityInput): Promise<Record<string, unknown>>;
  projectNodeCompletion(input: ProjectNodeActivityInput): Promise<void>;
}
