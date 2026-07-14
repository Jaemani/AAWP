import type { NormalizedRoutingFeatures } from "./features.js";

export type RoutingMode = "DIRECT" | "CONTRACT" | "EXPLORER";

export interface RoutingContribution {
  feature: keyof Omit<NormalizedRoutingFeatures, "maxBudgetUsd" | "scopeClosed" | "sourceDigest">;
  weight: number;
  value: number;
  contribution: number;
}

export interface RoutingDecision {
  mode: RoutingMode;
  checkpoint: "none" | "minimal" | "durable";
  workflowGain: number;
  policyVersion: "value-router/v1";
  featureDigest: string;
  reasons: RoutingContribution[];
  overrideReason?: "ZERO_WORKFLOW_BUDGET";
}

const weights: Record<RoutingContribution["feature"], number> = {
  durabilityNeed: 2,
  independentParallelism: 1.8,
  independentVerifiability: 1.8,
  auditOrApprovalNeed: 1.5,
  artifactReusePotential: 1.5,
  sideEffectRisk: 1.2,
  sharedContextCoupling: -2,
  coordinationOverhead: -1.5,
  latencySensitivity: -1.2,
  lowTaskComplexity: -1
};

export function routeTask(features: NormalizedRoutingFeatures): RoutingDecision {
  const reasons = (Object.keys(weights) as RoutingContribution["feature"][])
    .map((feature) => ({
      feature,
      weight: weights[feature],
      value: features[feature],
      contribution: weights[feature] * features[feature]
    }))
    .sort((left, right) => {
      const magnitude = Math.abs(right.contribution) - Math.abs(left.contribution);
      return magnitude !== 0
        ? magnitude
        : left.feature < right.feature
          ? -1
          : left.feature > right.feature
            ? 1
            : 0;
    });
  const workflowGain = reasons.reduce((sum, reason) => sum + reason.contribution, 0);
  if (features.maxBudgetUsd === 0) {
    return {
      mode: "DIRECT",
      checkpoint: "none",
      workflowGain,
      policyVersion: "value-router/v1",
      featureDigest: features.sourceDigest,
      reasons,
      overrideReason: "ZERO_WORKFLOW_BUDGET"
    };
  }
  if (workflowGain < 1) {
    return {
      mode: "DIRECT",
      checkpoint: "none",
      workflowGain,
      policyVersion: "value-router/v1",
      featureDigest: features.sourceDigest,
      reasons
    };
  }
  if (workflowGain < 3) {
    return {
      mode: "DIRECT",
      checkpoint: "minimal",
      workflowGain,
      policyVersion: "value-router/v1",
      featureDigest: features.sourceDigest,
      reasons
    };
  }
  return {
    mode: features.scopeClosed ? "CONTRACT" : "EXPLORER",
    checkpoint: "durable",
    workflowGain,
    policyVersion: "value-router/v1",
    featureDigest: features.sourceDigest,
    reasons
  };
}
