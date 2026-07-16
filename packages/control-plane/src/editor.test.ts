import { describe, expect, it } from "vitest";
import {
  applyWorkflowEdit,
  createWorkflowEditorDocument,
  parseWorkflowEditorDocument
} from "./editor.js";
import { projectWorkflowGraph } from "./graph.js";
import { semanticDiffWorkflows } from "./semantic-diff.js";
import { fixtureWorkflow } from "./test-fixture.js";

describe("control-plane workflow editor", () => {
  it("round-trips canonical WIR without changing its digest", () => {
    const document = createWorkflowEditorDocument(fixtureWorkflow());
    const reparsed = parseWorkflowEditorDocument(document.canonicalJson);

    expect(reparsed.digest).toBe(document.digest);
    expect(reparsed.canonicalJson).toBe(document.canonicalJson);
    expect(projectWorkflowGraph(reparsed.workflow)).toMatchObject({
      workflowId: "control-plane-fixture",
      worstCaseCostUsd: 0.2,
      contracts: { verifierIds: ["release"] }
    });

    const firstNode = reparsed.workflow.nodes[0]!;
    const named = projectWorkflowGraph({
      ...reparsed.workflow,
      nodes: [
        { ...firstNode, displayName: "기능 작업", description: "구현 산출물 생성" },
        ...reparsed.workflow.nodes.slice(1)
      ]
    }).nodes.find((node) => node.id === firstNode.id);
    expect(named).toMatchObject({
      displayName: "기능 작업",
      description: "구현 산출물 생성"
    });
  });

  it("produces a compiler-checked edit and a stable semantic diff", () => {
    const document = createWorkflowEditorDocument(fixtureWorkflow());
    const build = document.workflow.nodes.find((node) => node.id === "build")!;
    const result = applyWorkflowEdit(document, {
      kind: "upsert_node",
      node: { ...build, budget: { ...build.budget, timeoutSec: 90 } }
    });

    expect(result.publishable).toBe(true);
    const diff = semanticDiffWorkflows(document.workflow, result.candidate);
    expect(diff.changes).toMatchObject([
      {
        entityType: "node",
        entityId: "build",
        kind: "modified",
        changedPaths: ["/budget/timeoutSec"]
      }
    ]);
  });

  it("keeps an invalid candidate visible but blocks publication", () => {
    const document = createWorkflowEditorDocument(fixtureWorkflow());
    const result = applyWorkflowEdit(document, { kind: "remove_node", nodeId: "verify" });

    expect(result.publishable).toBe(false);
    expect(result.digest).toBeUndefined();
    expect(result.diagnostics.some((item) => item.severity === "error")).toBe(true);
  });

  it("ignores entity ordering but reports a newly added policy field", () => {
    const before = fixtureWorkflow();
    const reordered = structuredClone(before);
    reordered.nodes.reverse();
    reordered.edges.reverse();
    expect(semanticDiffWorkflows(before, reordered).changed).toBe(false);

    reordered.scopePolicy = { ...reordered.scopePolicy, approvalRequired: true };
    expect(semanticDiffWorkflows(before, reordered).changes).toMatchObject([
      {
        entityType: "contract",
        entityId: "scopePolicy",
        impact: "security",
        changedPaths: ["/approvalRequired"]
      }
    ]);
  });
});
