import { validateWorkflow, type Diagnostic } from "@awf/compiler";
import { canonicalize, digestWorkflow, type WorkflowDefinition, type WorkflowNode } from "@awf/ir";

export interface WorkflowEditorDocument {
  workflow: WorkflowDefinition;
  canonicalJson: string;
  digest: string;
}

export type ContractFields = Pick<
  WorkflowDefinition,
  "artifactSchemas" | "inputs" | "outputs" | "verifierDefinitions" | "scopePolicy" | "releasePolicy"
>;

export type WorkflowEditOperation =
  | { kind: "upsert_node"; node: WorkflowNode }
  | { kind: "remove_node"; nodeId: string }
  | { kind: "upsert_edge"; edge: WorkflowDefinition["edges"][number] }
  | { kind: "remove_edge"; edgeId: string }
  | { kind: "replace_contracts"; contracts: ContractFields };

export interface WorkflowEditResult {
  candidate: WorkflowDefinition;
  canonicalJson: string;
  publishable: boolean;
  diagnostics: ReadonlyArray<Diagnostic>;
  digest?: string;
}

export class WorkflowDocumentError extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(`workflow document is invalid: ${diagnostics.map((item) => item.code).join(",")}`);
    this.name = "WorkflowDocumentError";
  }
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshot<T>(value: T): T {
  const parsed = JSON.parse(canonicalize(value)) as T;
  const freeze = (current: unknown): void => {
    if (typeof current !== "object" || current === null || Object.isFrozen(current)) return;
    for (const child of Object.values(current)) freeze(child);
    Object.freeze(current);
  };
  freeze(parsed);
  return parsed;
}

function endpointId(endpoint: WorkflowDefinition["edges"][number]["source" | "target"]): string {
  return endpoint.kind === "workflowInput" || endpoint.kind === "workflowOutput"
    ? `${endpoint.kind}:${endpoint.port}`
    : `${endpoint.kind}:${endpoint.nodeId}:${endpoint.port}`;
}

export function workflowEdgeId(edge: WorkflowDefinition["edges"][number]): string {
  return `${endpointId(edge.source)}->${endpointId(edge.target)}`;
}

export function createWorkflowEditorDocument(input: unknown): WorkflowEditorDocument {
  const result = validateWorkflow(input);
  if (!result.ok) throw new WorkflowDocumentError(result.diagnostics);
  const workflow = snapshot(input as WorkflowDefinition);
  const canonicalJson = canonicalize(workflow);
  return Object.freeze({ workflow, canonicalJson, digest: digestWorkflow(workflow) });
}

export function parseWorkflowEditorDocument(json: string): WorkflowEditorDocument {
  let input: unknown;
  try {
    input = JSON.parse(json) as unknown;
  } catch (error) {
    throw new SyntaxError(`workflow JSON is invalid: ${(error as Error).message}`);
  }
  return createWorkflowEditorDocument(input);
}

export function applyWorkflowEdit(
  document: WorkflowEditorDocument,
  operation: WorkflowEditOperation
): WorkflowEditResult {
  const candidate = snapshot(document.workflow);
  let edited: WorkflowDefinition;
  switch (operation.kind) {
    case "upsert_node": {
      const nodes = candidate.nodes.filter((node) => node.id !== operation.node.id);
      nodes.push(snapshot(operation.node));
      edited = { ...candidate, nodes: nodes.sort((left, right) => utf16(left.id, right.id)) };
      break;
    }
    case "remove_node":
      edited = {
        ...candidate,
        nodes: candidate.nodes.filter((node) => node.id !== operation.nodeId),
        edges: candidate.edges.filter(
          (edge) =>
            !(edge.source.kind === "nodeOutput" && edge.source.nodeId === operation.nodeId) &&
            !(edge.target.kind === "nodeInput" && edge.target.nodeId === operation.nodeId)
        )
      };
      break;
    case "upsert_edge": {
      const id = workflowEdgeId(operation.edge);
      const edges = candidate.edges.filter((edge) => workflowEdgeId(edge) !== id);
      edges.push(snapshot(operation.edge));
      edited = {
        ...candidate,
        edges: edges.sort((left, right) => utf16(workflowEdgeId(left), workflowEdgeId(right)))
      };
      break;
    }
    case "remove_edge":
      edited = {
        ...candidate,
        edges: candidate.edges.filter((edge) => workflowEdgeId(edge) !== operation.edgeId)
      };
      break;
    case "replace_contracts":
      edited = { ...candidate, ...snapshot(operation.contracts) };
      break;
  }
  const frozen = snapshot(edited);
  const validation = validateWorkflow(frozen);
  const canonicalJson = canonicalize(frozen);
  return Object.freeze({
    candidate: frozen,
    canonicalJson,
    publishable: validation.ok,
    diagnostics: Object.freeze([...validation.diagnostics]),
    ...(validation.ok ? { digest: digestWorkflow(frozen) } : {})
  });
}
