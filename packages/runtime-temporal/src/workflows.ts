import type { WorkflowNode } from "@awf/ir";
import {
  ActivityCancellationType,
  ApplicationFailure,
  condition,
  defineQuery,
  defineSignal,
  patched,
  proxyActivities,
  setHandler,
  sleep,
  type ActivityOptions
} from "@temporalio/workflow";
import { KNOWN_RUNTIME_ERROR_CLASSES } from "./types.js";
import type {
  ApprovalSignalPayload,
  TemporalActivities,
  TemporalRunResult,
  TemporalRunStatus,
  TemporalWorkflowInput
} from "./types.js";

export const approvalSignal = defineSignal<[ApprovalSignalPayload]>("resolveApproval");
export const runtimeStatusQuery = defineQuery<TemporalRunStatus>("runtimeStatus");

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function activityOptions(node: WorkflowNode, taskQueue?: string): ActivityOptions {
  const nonRetryableErrorTypes = KNOWN_RUNTIME_ERROR_CLASSES.filter(
    (errorClass) => !node.retryPolicy.retryableClasses.includes(errorClass)
  );
  return {
    ...(taskQueue === undefined ? {} : { taskQueue }),
    startToCloseTimeout: node.budget.timeoutSec * 1000,
    heartbeatTimeout: Math.min(node.budget.timeoutSec * 1000, 2000),
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
    retry: {
      maximumAttempts: node.budget.maxAttempts,
      initialInterval: 100,
      backoffCoefficient: node.retryPolicy.backoff === "fixed" ? 1 : 2,
      maximumInterval: 10_000,
      nonRetryableErrorTypes
    }
  };
}

function validateOutputs(node: WorkflowNode, outputs: Record<string, unknown>): void {
  const expected = Object.keys(node.outputs).sort(utf16);
  const actual = Object.keys(outputs).sort(utf16);
  if (expected.length !== actual.length || expected.some((port, index) => port !== actual[index])) {
    throw ApplicationFailure.nonRetryable(
      `node ${node.id} returned ports ${actual.join(",")} but expected ${expected.join(",")}`,
      "NODE_OUTPUT_PORT_MISMATCH"
    );
  }
}

export async function durableWorkflow(input: TemporalWorkflowInput): Promise<TemporalRunResult> {
  patched("awf-m3-wir-runner-v1");
  const approvals = new Map<string, ApprovalSignalPayload>();
  const completedNodeIds: string[] = [];
  const nodeOutputs = new Map<string, Record<string, unknown>>();
  let status: TemporalRunStatus = {
    phase: "running",
    currentNodeId: null,
    completedNodeIds: []
  };
  setHandler(approvalSignal, (decision) => {
    approvals.set(decision.nodeId, decision);
  });
  setHandler(runtimeStatusQuery, () => ({
    ...status,
    completedNodeIds: [...status.completedNodeIds]
  }));

  const nodes = [...input.workflow.nodes].sort((left, right) => utf16(left.id, right.id));
  const edges = [...input.workflow.edges].sort((left, right) => {
    const leftTarget =
      left.target.kind === "nodeInput"
        ? `${left.target.nodeId}/${left.target.port}`
        : `~/${left.target.port}`;
    const rightTarget =
      right.target.kind === "nodeInput"
        ? `${right.target.nodeId}/${right.target.port}`
        : `~/${right.target.port}`;
    return utf16(leftTarget, rightTarget);
  });
  const remaining = new Set(nodes.map((node) => node.id));

  while (remaining.size > 0) {
    let progressed = false;
    for (const node of nodes) {
      if (!remaining.has(node.id)) continue;
      const incoming = edges.filter(
        (edge) => edge.target.kind === "nodeInput" && edge.target.nodeId === node.id
      );
      const ready = incoming.every((edge) =>
        edge.source.kind === "workflowInput"
          ? Object.hasOwn(input.inputs, edge.source.port)
          : nodeOutputs.has(edge.source.nodeId)
      );
      if (!ready) continue;

      const nodeInputs: Record<string, unknown> = {};
      for (const edge of incoming) {
        if (edge.target.kind !== "nodeInput") continue;
        nodeInputs[edge.target.port] =
          edge.source.kind === "workflowInput"
            ? input.inputs[edge.source.port]
            : nodeOutputs.get(edge.source.nodeId)?.[edge.source.port];
      }
      status = {
        phase: "running",
        currentNodeId: node.id,
        completedNodeIds: [...completedNodeIds]
      };

      if (node.kind === "wait") {
        const waitMs = input.nodeControls?.[node.id]?.waitMs;
        if (waitMs === undefined || !Number.isInteger(waitMs) || waitMs < 0) {
          throw ApplicationFailure.nonRetryable(
            `wait node ${node.id} requires a non-negative integer waitMs control`,
            "WAIT_CONTROL_INVALID"
          );
        }
        status = { ...status, phase: "waiting_timer" };
        await sleep(waitMs);
      }

      if (node.kind === "approval") {
        status = { ...status, phase: "waiting_approval" };
        await condition(() => approvals.has(node.id));
        const decision = approvals.get(node.id);
        if (decision?.approved !== true) {
          throw ApplicationFailure.nonRetryable(
            `approval node ${node.id} was rejected`,
            "APPROVAL_REJECTED",
            decision
          );
        }
      }

      const activities = proxyActivities<TemporalActivities>(
        activityOptions(node, input.activityTaskQueue)
      );
      const idempotencyKey =
        node.kind === "side_effect"
          ? `${input.tenantId}:${input.runId}:${node.id}:${node.sideEffect?.operation ?? "unknown"}`
          : undefined;
      const outputs = await activities.executeNode({
        tenantId: input.tenantId,
        runId: input.runId,
        node,
        inputs: nodeInputs,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey })
      });
      validateOutputs(node, outputs);
      await activities.projectNodeCompletion({
        tenantId: input.tenantId,
        runId: input.runId,
        nodeId: node.id,
        eventKey: `${input.runId}:${node.id}:completed`,
        outputs
      });
      nodeOutputs.set(node.id, outputs);
      completedNodeIds.push(node.id);
      remaining.delete(node.id);
      progressed = true;
    }
    if (!progressed) {
      throw ApplicationFailure.nonRetryable(
        `workflow stalled with nodes: ${[...remaining].sort(utf16).join(",")}`,
        "WORKFLOW_STALLED"
      );
    }
  }

  const outputs: Record<string, unknown> = {};
  for (const port of Object.keys(input.workflow.outputs).sort(utf16)) {
    const edge = edges.find(
      (candidate) => candidate.target.kind === "workflowOutput" && candidate.target.port === port
    );
    if (edge === undefined) {
      throw ApplicationFailure.nonRetryable(
        `workflow output ${port} has no producer`,
        "WORKFLOW_OUTPUT_MISSING"
      );
    }
    const value =
      edge.source.kind === "workflowInput"
        ? input.inputs[edge.source.port]
        : nodeOutputs.get(edge.source.nodeId)?.[edge.source.port];
    if (value === undefined) {
      throw ApplicationFailure.nonRetryable(
        `workflow output ${port} was not produced`,
        "WORKFLOW_OUTPUT_MISSING"
      );
    }
    outputs[port] = value;
  }

  status = {
    phase: "completed",
    currentNodeId: null,
    completedNodeIds: [...completedNodeIds]
  };
  return {
    runId: input.runId,
    workflowId: input.workflow.id,
    workflowVersion: input.workflow.version,
    completedNodeIds,
    outputs
  };
}
