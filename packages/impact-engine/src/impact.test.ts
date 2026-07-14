import { describe, expect, it } from "vitest";
import { diffRevisionStates, type ChangeReasonCode } from "./diff.js";
import { computeImpact } from "./invalidate.js";
import { fixtureState } from "./test-fixture.js";

function actions(result: ReturnType<typeof computeImpact>): Record<string, string> {
  return Object.fromEntries(result.decisions.map((decision) => [decision.nodeId, decision.action]));
}

describe("revision diff and invalidation", () => {
  it("invalidates only the downstream closure of a changed input", () => {
    const parent = fixtureState();
    const candidate = fixtureState();
    candidate.inputArtifactHashes.spec = "spec-b";
    const changes = diffRevisionStates(parent, candidate);
    expect(changes.roots).toEqual([
      {
        nodeId: "requirements",
        reasons: [{ code: "INPUT_ARTIFACT_CHANGED", source: "spec" }]
      }
    ]);
    expect(actions(computeImpact(candidate.workflow, changes))).toEqual({
      assets: "reuse",
      product: "rerun",
      requirements: "rerun",
      verify: "rerun"
    });
  });

  it("uses declared contract consumers as changed roots", () => {
    const parent = fixtureState();
    const candidate = fixtureState();
    candidate.contractDigests["REQ-1"] = "contract-b";
    const impact = computeImpact(candidate.workflow, diffRevisionStates(parent, candidate));
    expect(actions(impact)).toEqual({
      assets: "reuse",
      product: "rerun",
      requirements: "reuse",
      verify: "rerun"
    });
  });

  it("fails safe across all nodes when a changed contract has no mapped consumer", () => {
    const parent = fixtureState();
    const candidate = fixtureState();
    candidate.contractDigests["REQ-1"] = "contract-b";
    candidate.contractConsumers["REQ-1"] = [];
    parent.contractConsumers["REQ-1"] = [];
    const impact = computeImpact(candidate.workflow, diffRevisionStates(parent, candidate));
    expect(impact.decisions.every((decision) => decision.action === "rerun")).toBe(true);
  });

  it.each([
    ["toolSchemaDigest", "tool-v2", "TOOL_SCHEMA_CHANGED"],
    ["environmentImageDigest", "env-v2", "ENVIRONMENT_CHANGED"],
    ["policyVersion", "policy-v2", "POLICY_CHANGED"],
    ["verifierPolicyDigest", "verifier-v2", "VERIFIER_CHANGED"],
    ["modelDigest", "model-v2", "MODEL_CHANGED"]
  ] as const)("detects %s changes", (key, value, reason) => {
    const parent = fixtureState();
    const candidate = fixtureState();
    candidate.executionProfiles.product![key] = value;
    const changes = diffRevisionStates(parent, candidate);
    expect(changes.roots.find((root) => root.nodeId === "product")?.reasons).toContainEqual({
      code: reason as ChangeReasonCode,
      source: key
    });
  });

  it("detects undeclared reads and forces the node and downstream to rerun", () => {
    const state = fixtureState();
    const product = state.workflow.nodes.find((node) => node.id === "product")!;
    product.reads = ["workspace/public/**"];
    const impact = computeImpact(
      state.workflow,
      { roots: [], removedNodeIds: [], workflowReasons: [] },
      { observedReads: { product: ["workspace/private/secret.txt"] } }
    );
    expect(impact.unsafe).toBe(true);
    expect(impact.safetyViolations).toContainEqual({
      code: "UNDECLARED_READ",
      nodeId: "product",
      value: "workspace/private/secret.txt"
    });
    expect(impact.decisions.find((item) => item.nodeId === "product")?.mandatoryRerun).toBe(true);
    expect(impact.decisions.find((item) => item.nodeId === "verify")?.mandatoryRerun).toBe(true);
  });

  it("fails safe across all nodes when read instrumentation names an unknown node", () => {
    const state = fixtureState();
    const impact = computeImpact(
      state.workflow,
      { roots: [], removedNodeIds: [], workflowReasons: [] },
      { observedReads: { missing: ["workspace/private/secret.txt"] } }
    );
    expect(impact.unsafe).toBe(true);
    expect(impact.decisions.every((decision) => decision.mandatoryRerun)).toBe(true);
  });

  it("always reruns declared broad regression nodes", () => {
    const state = fixtureState();
    const impact = computeImpact(
      state.workflow,
      { roots: [], removedNodeIds: [], workflowReasons: [] },
      { broadRegressionNodeIds: ["verify"] }
    );
    expect(impact.decisions.find((item) => item.nodeId === "verify")).toMatchObject({
      action: "rerun",
      mandatoryRerun: true,
      reasons: [{ code: "BROAD_REGRESSION", source: "verify" }]
    });
  });
});
