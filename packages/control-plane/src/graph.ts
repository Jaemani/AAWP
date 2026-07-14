import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";
import { workflowEdgeId } from "./editor.js";

export interface WorkflowGraphNode {
  id: string;
  kind: WorkflowNode["kind"];
  version: string;
  owner: WorkflowNode["owner"];
  reads: string[];
  writes: string[];
  secretRefs: string[];
  network: string[];
  verifierIds: string[];
  worstCaseCostUsd: number;
  incomingEdgeIds: string[];
  outgoingEdgeIds: string[];
}

export interface WorkflowGraphProjection {
  workflowId: string;
  version: string;
  mode: WorkflowDefinition["mode"];
  nodes: WorkflowGraphNode[];
  edges: Array<{ id: string; label: string }>;
  contracts: {
    inputNames: string[];
    outputNames: string[];
    verifierIds: string[];
    allowedSecrets: string[];
    allowedNetworkHosts: string[];
  };
  worstCaseCostUsd: number;
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").sort(utf16)
    : [];
}

function nodeWorstCaseCost(node: WorkflowNode): number {
  const rounds = node.kind === "loop" ? (node.loop?.maxRounds ?? 1) : 1;
  return (node.budget.maxCostUsd ?? 0) * node.budget.maxAttempts * rounds;
}

export function projectWorkflowGraph(workflow: WorkflowDefinition): WorkflowGraphProjection {
  const edges = workflow.edges
    .map((edge) => {
      const id = workflowEdgeId(edge);
      return { id, label: edge.condition === undefined ? id : `${id} if ${edge.condition}` };
    })
    .sort((left, right) => utf16(left.id, right.id));
  const nodes = workflow.nodes
    .map((node): WorkflowGraphNode => ({
      id: node.id,
      kind: node.kind,
      version: node.version,
      owner: { ...node.owner },
      reads: [...node.reads].sort(utf16),
      writes: [...node.writes].sort(utf16),
      secretRefs: [...node.capabilities.secretRefs].sort(utf16),
      network: [...node.capabilities.network].sort(utf16),
      verifierIds: node.verifiers.map((item) => item.verifierId).sort(utf16),
      worstCaseCostUsd: nodeWorstCaseCost(node),
      incomingEdgeIds: workflow.edges
        .filter((edge) => edge.target.kind === "nodeInput" && edge.target.nodeId === node.id)
        .map(workflowEdgeId)
        .sort(utf16),
      outgoingEdgeIds: workflow.edges
        .filter((edge) => edge.source.kind === "nodeOutput" && edge.source.nodeId === node.id)
        .map(workflowEdgeId)
        .sort(utf16)
    }))
    .sort((left, right) => utf16(left.id, right.id));
  return {
    workflowId: workflow.id,
    version: workflow.version,
    mode: workflow.mode,
    nodes,
    edges,
    contracts: {
      inputNames: Object.keys(workflow.inputs).sort(utf16),
      outputNames: Object.keys(workflow.outputs).sort(utf16),
      verifierIds: workflow.verifierDefinitions.map((item) => item.id).sort(utf16),
      allowedSecrets: stringArray(workflow.scopePolicy.allowedSecrets),
      allowedNetworkHosts: stringArray(workflow.scopePolicy.allowedNetworkHosts)
    },
    worstCaseCostUsd: nodes.reduce((sum, node) => sum + node.worstCaseCostUsd, 0)
  };
}
