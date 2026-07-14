import { describe, expect, it } from "vitest";
import { extractRoutingFeatures, type RoutingFeatures } from "./features.js";
import { routeTask } from "./rules.js";
import { templateForMode } from "./templates.js";

function features(overrides: Partial<RoutingFeatures> = {}): RoutingFeatures {
  return {
    estimatedContextTokens: 1_000,
    sharedContextCoupling: 0,
    independentBranchCount: 1,
    objectiveVerifierCoverage: 0.1,
    expectedDurationSec: 30,
    approvalCount: 0,
    sideEffectRisk: 0,
    recoveryNeed: 0,
    artifactReusePotential: 0,
    latencySensitivity: 0.5,
    maxBudgetUsd: 1,
    scopeClosed: true,
    ...overrides
  };
}

describe("explainable value router", () => {
  it("defaults a small tightly coupled task to DIRECT without a checkpoint", () => {
    const decision = routeTask(
      extractRoutingFeatures(features({ sharedContextCoupling: 0.9, latencySensitivity: 1 }))
    );
    expect(decision).toMatchObject({ mode: "DIRECT", checkpoint: "none" });
    expect(decision.reasons[0]?.contribution).toBeLessThan(0);
  });

  it("uses a minimal checkpoint in the middle score band", () => {
    const decision = routeTask(
      extractRoutingFeatures(
        features({
          recoveryNeed: 0.8,
          objectiveVerifierCoverage: 0.5,
          artifactReusePotential: 0.3,
          latencySensitivity: 0
        })
      )
    );
    expect(decision.mode).toBe("DIRECT");
    expect(decision.checkpoint).toBe("minimal");
    expect(decision.workflowGain).toBeGreaterThanOrEqual(1);
    expect(decision.workflowGain).toBeLessThan(3);
  });

  it("selects CONTRACT for closed scope and EXPLORER for an open goal", () => {
    const highValue = features({
      estimatedContextTokens: 150_000,
      independentBranchCount: 8,
      objectiveVerifierCoverage: 1,
      expectedDurationSec: 7200,
      approvalCount: 3,
      sideEffectRisk: 0.8,
      recoveryNeed: 1,
      artifactReusePotential: 1,
      latencySensitivity: 0,
      scopeClosed: true
    });
    expect(routeTask(extractRoutingFeatures(highValue)).mode).toBe("CONTRACT");
    expect(routeTask(extractRoutingFeatures({ ...highValue, scopeClosed: false })).mode).toBe(
      "EXPLORER"
    );
  });

  it("does not authorize workflow spend when its budget is zero", () => {
    const normalized = extractRoutingFeatures(
      features({ recoveryNeed: 1, objectiveVerifierCoverage: 1, maxBudgetUsd: 0 })
    );
    expect(routeTask(normalized)).toMatchObject({
      mode: "DIRECT",
      overrideReason: "ZERO_WORKFLOW_BUDGET"
    });
  });

  it("returns independent templates for all three modes", () => {
    const direct = templateForMode("DIRECT");
    const contract = templateForMode("CONTRACT");
    const explorer = templateForMode("EXPLORER");
    expect(direct.nodes).toHaveLength(2);
    expect(contract.nodes.some((node) => node.role === "contract_compiler")).toBe(true);
    expect(explorer.nodes.some((node) => node.role === "branch")).toBe(true);
    direct.nodes[0]!.id = "changed";
    expect(templateForMode("DIRECT").nodes[0]?.id).toBe("executor");
  });
});
