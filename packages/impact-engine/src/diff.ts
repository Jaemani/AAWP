import { canonicalize, type WorkflowDefinition, type WorkflowNode } from "@awf/ir";
import type { NodeExecutionProfile, RevisionState } from "./revision.js";

export type ChangeReasonCode =
  | "INPUT_ARTIFACT_CHANGED"
  | "CONTRACT_CHANGED"
  | "NODE_ADDED"
  | "NODE_DEFINITION_CHANGED"
  | "EDGE_CHANGED"
  | "WORKFLOW_IDENTITY_CHANGED"
  | "WORKFLOW_VERSION_CHANGED"
  | "WORKFLOW_SCHEMA_CHANGED"
  | "WORKFLOW_POLICY_CHANGED"
  | "WORKFLOW_VERIFIER_CHANGED"
  | "PROMPT_CHANGED"
  | "MODEL_CHANGED"
  | "TOOL_SCHEMA_CHANGED"
  | "ENVIRONMENT_CHANGED"
  | "POLICY_CHANGED"
  | "VERIFIER_CHANGED"
  | "WORKSPACE_BASE_CHANGED"
  | "EXECUTION_PROFILE_CHANGED";

export interface ChangeReason {
  code: ChangeReasonCode;
  source: string;
}

export interface ChangedNodeRoot {
  nodeId: string;
  reasons: ChangeReason[];
}

export interface ChangedRootSet {
  roots: ChangedNodeRoot[];
  removedNodeIds: string[];
  workflowReasons: ChangeReason[];
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function equal(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalize(left) === canonicalize(right);
}

function unionKeys(left: object, right: object): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(utf16);
}

function nodesById(workflow: WorkflowDefinition): Map<string, WorkflowNode> {
  return new Map(workflow.nodes.map((node) => [node.id, node]));
}

function inputConsumers(workflow: WorkflowDefinition, port: string): string[] {
  return workflow.edges
    .filter(
      (edge) =>
        edge.source.kind === "workflowInput" &&
        edge.source.port === port &&
        edge.target.kind === "nodeInput"
    )
    .map((edge) => (edge.target.kind === "nodeInput" ? edge.target.nodeId : ""))
    .filter((nodeId) => nodeId.length > 0)
    .sort(utf16);
}

function addReason(
  roots: Map<string, Map<string, ChangeReason>>,
  candidateNodes: Map<string, WorkflowNode>,
  nodeId: string,
  reason: ChangeReason
): void {
  if (!candidateNodes.has(nodeId)) return;
  const reasons = roots.get(nodeId) ?? new Map<string, ChangeReason>();
  reasons.set(`${reason.code}\0${reason.source}`, reason);
  roots.set(nodeId, reasons);
}

function addToAll(
  roots: Map<string, Map<string, ChangeReason>>,
  candidateNodes: Map<string, WorkflowNode>,
  reason: ChangeReason
): void {
  for (const nodeId of [...candidateNodes.keys()].sort(utf16)) {
    addReason(roots, candidateNodes, nodeId, reason);
  }
}

function changedSchemaRefs(parent: WorkflowDefinition, candidate: WorkflowDefinition): Set<string> {
  const parentSchemas = new Map(
    parent.artifactSchemas.map((schema) => [
      `${schema.type}@${schema.schemaVersion}`,
      schema.schema
    ])
  );
  const candidateSchemas = new Map(
    candidate.artifactSchemas.map((schema) => [
      `${schema.type}@${schema.schemaVersion}`,
      schema.schema
    ])
  );
  return new Set(
    unionKeys(Object.fromEntries(parentSchemas), Object.fromEntries(candidateSchemas)).filter(
      (key) => !equal(parentSchemas.get(key), candidateSchemas.get(key))
    )
  );
}

const profileReasons: Array<{
  key: keyof NodeExecutionProfile;
  code: ChangeReasonCode;
}> = [
  { key: "promptTemplateDigest", code: "PROMPT_CHANGED" },
  { key: "modelDigest", code: "MODEL_CHANGED" },
  { key: "toolSchemaDigest", code: "TOOL_SCHEMA_CHANGED" },
  { key: "environmentImageDigest", code: "ENVIRONMENT_CHANGED" },
  { key: "policyVersion", code: "POLICY_CHANGED" },
  { key: "verifierPolicyDigest", code: "VERIFIER_CHANGED" },
  { key: "workspaceBaseTreeHash", code: "WORKSPACE_BASE_CHANGED" }
];

export function diffRevisionStates(
  parent: RevisionState,
  candidate: RevisionState
): ChangedRootSet {
  const roots = new Map<string, Map<string, ChangeReason>>();
  const parentNodes = nodesById(parent.workflow);
  const candidateNodes = nodesById(candidate.workflow);
  const workflowReasons: ChangeReason[] = [];

  for (const port of unionKeys(parent.inputArtifactHashes, candidate.inputArtifactHashes)) {
    if (parent.inputArtifactHashes[port] === candidate.inputArtifactHashes[port]) continue;
    for (const nodeId of [
      ...new Set([
        ...inputConsumers(parent.workflow, port),
        ...inputConsumers(candidate.workflow, port)
      ])
    ]) {
      addReason(roots, candidateNodes, nodeId, { code: "INPUT_ARTIFACT_CHANGED", source: port });
    }
  }

  for (const contractId of unionKeys(parent.contractDigests, candidate.contractDigests)) {
    if (
      parent.contractDigests[contractId] === candidate.contractDigests[contractId] &&
      equal(parent.contractConsumers[contractId], candidate.contractConsumers[contractId])
    )
      continue;
    const consumers = new Set([
      ...(parent.contractConsumers[contractId] ?? []),
      ...(candidate.contractConsumers[contractId] ?? [])
    ]);
    let mappedConsumers = 0;
    for (const nodeId of [...consumers].sort(utf16)) {
      if (candidateNodes.has(nodeId)) mappedConsumers += 1;
      addReason(roots, candidateNodes, nodeId, { code: "CONTRACT_CHANGED", source: contractId });
    }
    if (mappedConsumers === 0) {
      addToAll(roots, candidateNodes, {
        code: "CONTRACT_CHANGED",
        source: `${contractId}:unmapped`
      });
    }
  }

  for (const nodeId of unionKeys(
    Object.fromEntries(parentNodes),
    Object.fromEntries(candidateNodes)
  )) {
    const before = parentNodes.get(nodeId);
    const after = candidateNodes.get(nodeId);
    if (after === undefined) continue;
    if (before === undefined) {
      addReason(roots, candidateNodes, nodeId, { code: "NODE_ADDED", source: nodeId });
    } else if (!equal(before, after)) {
      addReason(roots, candidateNodes, nodeId, {
        code: "NODE_DEFINITION_CHANGED",
        source: nodeId
      });
    }
  }

  const parentEdges = new Map(parent.workflow.edges.map((edge) => [canonicalize(edge), edge]));
  const candidateEdges = new Map(
    candidate.workflow.edges.map((edge) => [canonicalize(edge), edge])
  );
  for (const key of unionKeys(
    Object.fromEntries(parentEdges),
    Object.fromEntries(candidateEdges)
  )) {
    if (parentEdges.has(key) && candidateEdges.has(key)) continue;
    const edge = candidateEdges.get(key) ?? parentEdges.get(key);
    if (edge?.target.kind === "nodeInput") {
      addReason(roots, candidateNodes, edge.target.nodeId, {
        code: "EDGE_CHANGED",
        source: `${edge.target.nodeId}/${edge.target.port}`
      });
    } else if (edge !== undefined) {
      workflowReasons.push({ code: "EDGE_CHANGED", source: `output/${edge.target.port}` });
    }
  }

  if (
    parent.workflow.id !== candidate.workflow.id ||
    parent.workflow.apiVersion !== candidate.workflow.apiVersion ||
    parent.workflow.mode !== candidate.workflow.mode
  ) {
    addToAll(roots, candidateNodes, { code: "WORKFLOW_IDENTITY_CHANGED", source: "workflow" });
  }
  if (parent.workflow.version !== candidate.workflow.version) {
    addToAll(roots, candidateNodes, { code: "WORKFLOW_VERSION_CHANGED", source: "workflow" });
  }
  const schemaRefs = changedSchemaRefs(parent.workflow, candidate.workflow);
  for (const node of candidate.workflow.nodes) {
    const refs = [...Object.values(node.inputs), ...Object.values(node.outputs)].map(
      (port) => `${port.type}@${port.schemaVersion}`
    );
    if (refs.some((ref) => schemaRefs.has(ref))) {
      addReason(roots, candidateNodes, node.id, {
        code: "WORKFLOW_SCHEMA_CHANGED",
        source: [...schemaRefs].sort(utf16).join(",")
      });
    }
  }
  if (!equal(parent.workflow.inputs, candidate.workflow.inputs)) {
    for (const port of unionKeys(parent.workflow.inputs, candidate.workflow.inputs)) {
      if (equal(parent.workflow.inputs[port], candidate.workflow.inputs[port])) continue;
      for (const nodeId of inputConsumers(candidate.workflow, port)) {
        addReason(roots, candidateNodes, nodeId, {
          code: "WORKFLOW_SCHEMA_CHANGED",
          source: `input/${port}`
        });
      }
    }
  }
  if (!equal(parent.workflow.outputs, candidate.workflow.outputs)) {
    workflowReasons.push({ code: "WORKFLOW_SCHEMA_CHANGED", source: "workflowOutputs" });
  }
  if (!equal(parent.workflow.scopePolicy, candidate.workflow.scopePolicy)) {
    addToAll(roots, candidateNodes, { code: "WORKFLOW_POLICY_CHANGED", source: "scopePolicy" });
  }
  if (
    !equal(parent.workflow.verifierDefinitions, candidate.workflow.verifierDefinitions) ||
    !equal(parent.workflow.releasePolicy, candidate.workflow.releasePolicy)
  ) {
    addToAll(roots, candidateNodes, {
      code: "WORKFLOW_VERIFIER_CHANGED",
      source: "releasePolicy"
    });
  }

  for (const nodeId of unionKeys(parent.executionProfiles, candidate.executionProfiles)) {
    const before = parent.executionProfiles[nodeId];
    const after = candidate.executionProfiles[nodeId];
    if (after === undefined) {
      if (before !== undefined) {
        addReason(roots, candidateNodes, nodeId, {
          code: "EXECUTION_PROFILE_CHANGED",
          source: "executionProfileRemoved"
        });
      }
      continue;
    }
    for (const item of profileReasons) {
      if (before?.[item.key] !== after[item.key]) {
        addReason(roots, candidateNodes, nodeId, { code: item.code, source: item.key });
      }
    }
  }

  return {
    roots: [...roots.entries()]
      .sort(([left], [right]) => utf16(left, right))
      .map(([nodeId, reasons]) => ({
        nodeId,
        reasons: [...reasons.values()].sort((left, right) =>
          utf16(`${left.code}\0${left.source}`, `${right.code}\0${right.source}`)
        )
      })),
    removedNodeIds: [...parentNodes.keys()]
      .filter((nodeId) => !candidateNodes.has(nodeId))
      .sort(utf16),
    workflowReasons: workflowReasons.sort((left, right) =>
      utf16(`${left.code}\0${left.source}`, `${right.code}\0${right.source}`)
    )
  };
}
