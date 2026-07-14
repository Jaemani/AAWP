import { canonicalize, type WorkflowDefinition } from "@awf/ir";
import { workflowEdgeId } from "./editor.js";

export type SemanticChangeKind = "added" | "removed" | "modified";
export type SemanticChangeImpact = "metadata" | "behavioral" | "security" | "breaking";

export interface SemanticEntityChange {
  entityType: "workflow" | "node" | "edge" | "artifact_schema" | "verifier" | "contract";
  entityId: string;
  kind: SemanticChangeKind;
  impact: SemanticChangeImpact;
  changedPaths: string[];
  before?: unknown;
  after?: unknown;
}

export interface WorkflowSemanticDiff {
  changed: boolean;
  changes: SemanticEntityChange[];
  summary: Record<SemanticChangeImpact, number>;
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function equal(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalize(left) === canonicalize(right);
}

function changedPaths(before: unknown, after: unknown, path = ""): string[] {
  if (equal(before, after)) return [];
  if (
    typeof before !== "object" ||
    before === null ||
    typeof after !== "object" ||
    after === null ||
    Array.isArray(before) ||
    Array.isArray(after)
  ) {
    return [path || "/"];
  }
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(utf16);
  return keys.flatMap((key) =>
    changedPaths(left[key], right[key], `${path}/${escapePointer(key)}`)
  );
}

function impactFor(
  entityType: SemanticEntityChange["entityType"],
  kind: SemanticChangeKind,
  paths: string[]
): SemanticChangeImpact {
  if (kind === "removed") return "breaking";
  if (entityType === "artifact_schema") return kind === "added" ? "behavioral" : "breaking";
  if (entityType === "edge") return "behavioral";
  const joined = paths.join("\0");
  if (
    joined.includes("/capabilities") ||
    joined.includes("/owner") ||
    joined.includes("scopePolicy") ||
    joined.includes("releasePolicy") ||
    entityType === "verifier"
  ) {
    return "security";
  }
  if (
    joined.includes("/inputs") ||
    joined.includes("/outputs") ||
    joined.includes("/kind") ||
    entityType === "contract"
  ) {
    return "breaking";
  }
  if (entityType === "workflow" && paths.every((path) => path === "/version")) return "metadata";
  return "behavioral";
}

function diffMap(
  entityType: SemanticEntityChange["entityType"],
  before: Map<string, unknown>,
  after: Map<string, unknown>
): SemanticEntityChange[] {
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort(utf16);
  const changes: SemanticEntityChange[] = [];
  for (const entityId of ids) {
    const left = before.get(entityId);
    const right = after.get(entityId);
    if (left === undefined && right !== undefined) {
      const impact =
        entityType === "contract" && ["scopePolicy", "releasePolicy"].includes(entityId)
          ? "security"
          : impactFor(entityType, "added", ["/"]);
      changes.push({
        entityType,
        entityId,
        kind: "added",
        impact,
        changedPaths: ["/"],
        after: right
      });
    } else if (left !== undefined && right === undefined) {
      changes.push({
        entityType,
        entityId,
        kind: "removed",
        impact: "breaking",
        changedPaths: ["/"],
        before: left
      });
    } else if (left !== undefined && right !== undefined && !equal(left, right)) {
      const paths = changedPaths(left, right).sort(utf16);
      const impact =
        entityType === "contract" && ["scopePolicy", "releasePolicy"].includes(entityId)
          ? "security"
          : impactFor(entityType, "modified", paths);
      changes.push({
        entityType,
        entityId,
        kind: "modified",
        impact,
        changedPaths: paths,
        before: left,
        after: right
      });
    }
  }
  return changes;
}

function workflowIdentity(workflow: WorkflowDefinition): Record<string, unknown> {
  return {
    apiVersion: workflow.apiVersion,
    id: workflow.id,
    version: workflow.version,
    mode: workflow.mode
  };
}

function contracts(workflow: WorkflowDefinition): Map<string, unknown> {
  return new Map([
    ["inputs", workflow.inputs],
    ["outputs", workflow.outputs],
    ["scopePolicy", workflow.scopePolicy],
    ["releasePolicy", workflow.releasePolicy]
  ]);
}

export function semanticDiffWorkflows(
  before: WorkflowDefinition,
  after: WorkflowDefinition
): WorkflowSemanticDiff {
  const changes: SemanticEntityChange[] = [];
  const identityPaths = changedPaths(workflowIdentity(before), workflowIdentity(after)).sort(utf16);
  if (identityPaths.length > 0) {
    changes.push({
      entityType: "workflow",
      entityId: after.id,
      kind: "modified",
      impact: impactFor("workflow", "modified", identityPaths),
      changedPaths: identityPaths,
      before: workflowIdentity(before),
      after: workflowIdentity(after)
    });
  }
  changes.push(
    ...diffMap(
      "node",
      new Map(before.nodes.map((node) => [node.id, node])),
      new Map(after.nodes.map((node) => [node.id, node]))
    ),
    ...diffMap(
      "edge",
      new Map(before.edges.map((edge) => [workflowEdgeId(edge), edge])),
      new Map(after.edges.map((edge) => [workflowEdgeId(edge), edge]))
    ),
    ...diffMap(
      "artifact_schema",
      new Map(
        before.artifactSchemas.map((schema) => [`${schema.type}@${schema.schemaVersion}`, schema])
      ),
      new Map(
        after.artifactSchemas.map((schema) => [`${schema.type}@${schema.schemaVersion}`, schema])
      )
    ),
    ...diffMap(
      "verifier",
      new Map(before.verifierDefinitions.map((verifier) => [verifier.id, verifier])),
      new Map(after.verifierDefinitions.map((verifier) => [verifier.id, verifier]))
    ),
    ...diffMap("contract", contracts(before), contracts(after))
  );
  changes.sort((left, right) =>
    utf16(
      `${left.entityType}\0${left.entityId}\0${left.kind}`,
      `${right.entityType}\0${right.entityId}\0${right.kind}`
    )
  );
  return {
    changed: changes.length > 0,
    changes,
    summary: {
      metadata: changes.filter((item) => item.impact === "metadata").length,
      behavioral: changes.filter((item) => item.impact === "behavioral").length,
      security: changes.filter((item) => item.impact === "security").length,
      breaking: changes.filter((item) => item.impact === "breaking").length
    }
  };
}
