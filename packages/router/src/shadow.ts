import { digestWorkflow } from "@awf/ir";
import type { RoutingDecision, RoutingMode } from "./rules.js";

export interface RoutingOutcome {
  normalizedQuality: number;
  normalizedCost: number;
  normalizedLatency: number;
  scopeViolation: number;
  humanIntervention: number;
}

export interface RewardWeights {
  cost: number;
  latency: number;
  scopeViolation: number;
  humanIntervention: number;
}

export interface ShadowRoutingObservation {
  observationId: string;
  runId: string;
  recommendedMode: RoutingMode;
  operatorMode: RoutingMode;
  executedMode: RoutingMode;
  productionDecisionChanged: false;
  featureDigest: string;
  recommendationPolicyVersion: string;
  operatorReward?: number;
  recommendationReward?: number;
  regret?: number;
  createdAt: string;
  digest: string;
}

function unit(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
  return value;
}

export function calculateRoutingReward(outcome: RoutingOutcome, weights: RewardWeights): number {
  return (
    unit(outcome.normalizedQuality, "normalizedQuality") -
    weights.cost * unit(outcome.normalizedCost, "normalizedCost") -
    weights.latency * unit(outcome.normalizedLatency, "normalizedLatency") -
    weights.scopeViolation * unit(outcome.scopeViolation, "scopeViolation") -
    weights.humanIntervention * unit(outcome.humanIntervention, "humanIntervention")
  );
}

export class InMemoryShadowRoutingStore {
  private readonly observations: ShadowRoutingObservation[] = [];
  private readonly observationIds = new Set<string>();

  record(input: {
    observationId: string;
    runId: string;
    recommendation: RoutingDecision;
    operatorMode: RoutingMode;
    createdAt: string;
    operatorOutcome?: RoutingOutcome;
    recommendationOutcome?: RoutingOutcome;
    weights?: RewardWeights;
  }): ShadowRoutingObservation {
    if (this.observationIds.has(input.observationId)) {
      throw new Error(`shadow observation already exists: ${input.observationId}`);
    }
    const weights = input.weights ?? {
      cost: 0.25,
      latency: 0.2,
      scopeViolation: 1,
      humanIntervention: 0.5
    };
    const operatorReward =
      input.operatorOutcome === undefined
        ? undefined
        : calculateRoutingReward(input.operatorOutcome, weights);
    const recommendationReward =
      input.recommendationOutcome === undefined
        ? undefined
        : calculateRoutingReward(input.recommendationOutcome, weights);
    const content = {
      observationId: input.observationId,
      runId: input.runId,
      recommendedMode: input.recommendation.mode,
      operatorMode: input.operatorMode,
      executedMode: input.operatorMode,
      productionDecisionChanged: false as const,
      featureDigest: input.recommendation.featureDigest,
      recommendationPolicyVersion: input.recommendation.policyVersion,
      ...(operatorReward === undefined ? {} : { operatorReward }),
      ...(recommendationReward === undefined ? {} : { recommendationReward }),
      ...(operatorReward === undefined || recommendationReward === undefined
        ? {}
        : { regret: recommendationReward - operatorReward }),
      createdAt: input.createdAt
    };
    const observation = Object.freeze({ ...content, digest: digestWorkflow(content) });
    this.observations.push(observation);
    this.observationIds.add(input.observationId);
    return observation;
  }

  list(): ReadonlyArray<Readonly<ShadowRoutingObservation>> {
    return [...this.observations];
  }
}
