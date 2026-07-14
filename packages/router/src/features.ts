import { digestWorkflow } from "@awf/ir";

export interface RoutingFeatures {
  estimatedContextTokens: number;
  sharedContextCoupling: number;
  independentBranchCount: number;
  objectiveVerifierCoverage: number;
  expectedDurationSec: number;
  approvalCount: number;
  sideEffectRisk: number;
  recoveryNeed: number;
  artifactReusePotential: number;
  latencySensitivity: number;
  maxBudgetUsd: number;
  scopeClosed: boolean;
}

export interface NormalizedRoutingFeatures {
  durabilityNeed: number;
  independentParallelism: number;
  independentVerifiability: number;
  auditOrApprovalNeed: number;
  artifactReusePotential: number;
  sideEffectRisk: number;
  sharedContextCoupling: number;
  coordinationOverhead: number;
  latencySensitivity: number;
  lowTaskComplexity: number;
  maxBudgetUsd: number;
  scopeClosed: boolean;
  sourceDigest: string;
}

export class RoutingFeatureError extends Error {
  constructor(
    readonly field: keyof RoutingFeatures,
    message: string
  ) {
    super(`invalid routing feature ${field}: ${message}`);
    this.name = "RoutingFeatureError";
  }
}

function unit(value: number, field: keyof RoutingFeatures): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RoutingFeatureError(field, "must be between 0 and 1");
  }
  return value;
}

function nonNegative(value: number, field: keyof RoutingFeatures): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RoutingFeatureError(field, "must be non-negative");
  }
  return value;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function extractRoutingFeatures(input: RoutingFeatures): NormalizedRoutingFeatures {
  const context = nonNegative(input.estimatedContextTokens, "estimatedContextTokens");
  const branches = nonNegative(input.independentBranchCount, "independentBranchCount");
  const duration = nonNegative(input.expectedDurationSec, "expectedDurationSec");
  const approvals = nonNegative(input.approvalCount, "approvalCount");
  const budget = nonNegative(input.maxBudgetUsd, "maxBudgetUsd");
  const shared = unit(input.sharedContextCoupling, "sharedContextCoupling");
  const verification = unit(input.objectiveVerifierCoverage, "objectiveVerifierCoverage");
  const sideEffect = unit(input.sideEffectRisk, "sideEffectRisk");
  const recovery = unit(input.recoveryNeed, "recoveryNeed");
  const reuse = unit(input.artifactReusePotential, "artifactReusePotential");
  const latency = unit(input.latencySensitivity, "latencySensitivity");
  const contextComplexity = clamp(context / 100_000);
  const durationComplexity = clamp(duration / 3_600);
  const parallelism = clamp(Math.max(0, branches - 1) / 7);
  const normalized = {
    durabilityNeed: Math.max(recovery, durationComplexity),
    independentParallelism: parallelism,
    independentVerifiability: verification,
    auditOrApprovalNeed: clamp(approvals / 3),
    artifactReusePotential: reuse,
    sideEffectRisk: sideEffect,
    sharedContextCoupling: shared,
    coordinationOverhead: clamp(shared * parallelism + Math.max(0, branches - 4) / 8),
    latencySensitivity: latency,
    lowTaskComplexity: clamp(1 - Math.max(contextComplexity, durationComplexity, parallelism)),
    maxBudgetUsd: budget,
    scopeClosed: input.scopeClosed,
    sourceDigest: digestWorkflow(input)
  };
  return normalized;
}
