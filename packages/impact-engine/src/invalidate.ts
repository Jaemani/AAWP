import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";
import type { ChangeReasonCode, ChangedRootSet } from "./diff.js";

export type ImpactReasonCode =
  ChangeReasonCode | "UPSTREAM_INVALIDATED" | "BROAD_REGRESSION" | "UNDECLARED_READ";

export interface ImpactReason {
  code: ImpactReasonCode;
  source: string;
}

export interface ImpactDecision {
  nodeId: string;
  action: "reuse" | "rerun";
  mandatoryRerun: boolean;
  reasons: ImpactReason[];
}

export interface ImpactSafetyViolation {
  code: "UNDECLARED_READ" | "UNKNOWN_OBSERVED_NODE" | "UNKNOWN_BROAD_REGRESSION_NODE";
  nodeId: string;
  value: string;
}

export interface ImpactResult {
  decisions: ImpactDecision[];
  removedNodeIds: string[];
  workflowReasons: ImpactReason[];
  safetyViolations: ImpactSafetyViolation[];
  unsafe: boolean;
}

export interface ImpactOptions {
  broadRegressionNodeIds?: string[];
  observedReads?: Record<string, string[]>;
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function patternMatches(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return value.startsWith(`${prefix}/`);
  }
  return pattern === value;
}

function reasonKey(reason: ImpactReason): string {
  return `${reason.code}\0${reason.source}`;
}

function addReason(reasons: Map<string, ImpactReason>, reason: ImpactReason): void {
  reasons.set(reasonKey(reason), reason);
}

function adjacency(workflow: WorkflowDefinition): Map<string, string[]> {
  const result = new Map<string, Set<string>>();
  for (const node of workflow.nodes) result.set(node.id, new Set());
  for (const edge of workflow.edges) {
    if (edge.source.kind !== "nodeOutput" || edge.target.kind !== "nodeInput") continue;
    result.get(edge.source.nodeId)?.add(edge.target.nodeId);
  }
  return new Map(
    [...result.entries()].map(([nodeId, targets]) => [nodeId, [...targets].sort(utf16)])
  );
}

function nodeMap(workflow: WorkflowDefinition): Map<string, WorkflowNode> {
  return new Map(workflow.nodes.map((node) => [node.id, node]));
}

export function computeImpact(
  workflow: WorkflowDefinition,
  changes: ChangedRootSet,
  options: ImpactOptions = {}
): ImpactResult {
  const nodes = nodeMap(workflow);
  const graph = adjacency(workflow);
  const reasonsByNode = new Map<string, Map<string, ImpactReason>>();
  const mandatory = new Set<string>();
  const violations: ImpactSafetyViolation[] = [];
  const forceAll = (reason: ImpactReason): void => {
    for (const nodeId of [...nodes.keys()].sort(utf16)) {
      mandatory.add(nodeId);
      const nodeReasons = reasonsByNode.get(nodeId) ?? new Map<string, ImpactReason>();
      addReason(nodeReasons, reason);
      reasonsByNode.set(nodeId, nodeReasons);
    }
  };

  for (const root of changes.roots) {
    if (!nodes.has(root.nodeId)) continue;
    const rootReasons = reasonsByNode.get(root.nodeId) ?? new Map<string, ImpactReason>();
    for (const reason of root.reasons) addReason(rootReasons, reason);
    reasonsByNode.set(root.nodeId, rootReasons);

    const visited = new Set<string>([root.nodeId]);
    const queue = [root.nodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const target of graph.get(current) ?? []) {
        if (visited.has(target)) continue;
        visited.add(target);
        queue.push(target);
        const targetReasons = reasonsByNode.get(target) ?? new Map<string, ImpactReason>();
        addReason(targetReasons, { code: "UPSTREAM_INVALIDATED", source: root.nodeId });
        reasonsByNode.set(target, targetReasons);
      }
    }
  }

  for (const [nodeId, reads] of Object.entries(options.observedReads ?? {}).sort(
    ([left], [right]) => utf16(left, right)
  )) {
    const node = nodes.get(nodeId);
    if (node === undefined) {
      violations.push({ code: "UNKNOWN_OBSERVED_NODE", nodeId, value: nodeId });
      forceAll({ code: "UNDECLARED_READ", source: `unknown-node:${nodeId}` });
      continue;
    }
    for (const read of [...new Set(reads)].sort(utf16)) {
      if (node.reads.some((pattern) => patternMatches(pattern, read))) continue;
      violations.push({ code: "UNDECLARED_READ", nodeId, value: read });
      mandatory.add(nodeId);
      const nodeReasons = reasonsByNode.get(nodeId) ?? new Map<string, ImpactReason>();
      addReason(nodeReasons, { code: "UNDECLARED_READ", source: read });
      reasonsByNode.set(nodeId, nodeReasons);
      const queue = [nodeId];
      const visited = new Set<string>([nodeId]);
      while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) break;
        for (const target of graph.get(current) ?? []) {
          if (visited.has(target)) continue;
          visited.add(target);
          queue.push(target);
          mandatory.add(target);
          const targetReasons = reasonsByNode.get(target) ?? new Map<string, ImpactReason>();
          addReason(targetReasons, { code: "UPSTREAM_INVALIDATED", source: nodeId });
          reasonsByNode.set(target, targetReasons);
        }
      }
    }
  }

  for (const nodeId of [...new Set(options.broadRegressionNodeIds ?? [])].sort(utf16)) {
    if (!nodes.has(nodeId)) {
      violations.push({ code: "UNKNOWN_BROAD_REGRESSION_NODE", nodeId, value: nodeId });
      forceAll({ code: "BROAD_REGRESSION", source: `unknown-node:${nodeId}` });
      continue;
    }
    mandatory.add(nodeId);
    const nodeReasons = reasonsByNode.get(nodeId) ?? new Map<string, ImpactReason>();
    addReason(nodeReasons, { code: "BROAD_REGRESSION", source: nodeId });
    reasonsByNode.set(nodeId, nodeReasons);
  }

  const decisions = [...nodes.keys()].sort(utf16).map((nodeId): ImpactDecision => {
    const reasons = [...(reasonsByNode.get(nodeId)?.values() ?? [])].sort((left, right) =>
      utf16(reasonKey(left), reasonKey(right))
    );
    return {
      nodeId,
      action: reasons.length === 0 ? "reuse" : "rerun",
      mandatoryRerun: mandatory.has(nodeId),
      reasons
    };
  });
  return {
    decisions,
    removedNodeIds: [...changes.removedNodeIds],
    workflowReasons: changes.workflowReasons.map((reason) => ({ ...reason })),
    safetyViolations: violations.sort((left, right) =>
      utf16(
        `${left.code}\0${left.nodeId}\0${left.value}`,
        `${right.code}\0${right.nodeId}\0${right.value}`
      )
    ),
    unsafe: violations.length > 0
  };
}
