import { describe, expect, it } from "vitest";
import { extractRoutingFeatures } from "./features.js";
import { routeTask } from "./rules.js";
import { InMemoryShadowRoutingStore, calculateRoutingReward } from "./shadow.js";

describe("shadow routing evaluation", () => {
  it("records a recommendation without changing the operator production decision", () => {
    const recommendation = routeTask(
      extractRoutingFeatures({
        estimatedContextTokens: 150_000,
        sharedContextCoupling: 0,
        independentBranchCount: 8,
        objectiveVerifierCoverage: 1,
        expectedDurationSec: 7200,
        approvalCount: 3,
        sideEffectRisk: 0.8,
        recoveryNeed: 1,
        artifactReusePotential: 1,
        latencySensitivity: 0,
        maxBudgetUsd: 10,
        scopeClosed: false
      })
    );
    const store = new InMemoryShadowRoutingStore();
    const observation = store.record({
      observationId: "shadow-1",
      runId: "run-a",
      recommendation,
      operatorMode: "DIRECT",
      operatorOutcome: {
        normalizedQuality: 0.6,
        normalizedCost: 0.2,
        normalizedLatency: 0.2,
        scopeViolation: 0,
        humanIntervention: 0.2
      },
      recommendationOutcome: {
        normalizedQuality: 0.9,
        normalizedCost: 0.4,
        normalizedLatency: 0.4,
        scopeViolation: 0,
        humanIntervention: 0
      },
      createdAt: "2026-07-14T00:00:00.000Z"
    });
    expect(observation).toMatchObject({
      recommendedMode: "EXPLORER",
      operatorMode: "DIRECT",
      executedMode: "DIRECT",
      productionDecisionChanged: false
    });
    expect(observation.regret).toBeGreaterThan(0);
    expect(store.list()).toHaveLength(1);
  });

  it("penalizes scope violations more than small cost improvements", () => {
    const weights = { cost: 0.25, latency: 0.2, scopeViolation: 1, humanIntervention: 0.5 };
    const safe = calculateRoutingReward(
      {
        normalizedQuality: 0.8,
        normalizedCost: 0.5,
        normalizedLatency: 0.5,
        scopeViolation: 0,
        humanIntervention: 0
      },
      weights
    );
    const unsafe = calculateRoutingReward(
      {
        normalizedQuality: 0.8,
        normalizedCost: 0.1,
        normalizedLatency: 0.5,
        scopeViolation: 1,
        humanIntervention: 0
      },
      weights
    );
    expect(safe).toBeGreaterThan(unsafe);
  });
});
