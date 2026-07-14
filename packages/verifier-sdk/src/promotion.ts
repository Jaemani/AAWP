import { CandidatePromoter, type BranchPointer } from "@awf/impact-engine";
import {
  evaluateMonotonicCandidate,
  type MonotonicCandidateDecision,
  type MonotonicCandidatePolicy
} from "./guard.js";
import type { EvidenceBundle } from "./schema.js";

export class VerifiedCandidatePromotionError extends Error {
  constructor(readonly decision: MonotonicCandidateDecision) {
    super(
      `candidate verification failed: ${decision.violations
        .map((violation) => `${violation.code}:${violation.source}`)
        .join(",")}`
    );
    this.name = "VerifiedCandidatePromotionError";
  }
}

export class VerifiedCandidateEvidenceContextError extends Error {
  constructor(readonly field: "tenantId" | "runId" | "branchId") {
    super(`candidate evidence does not match promotion ${field}`);
    this.name = "VerifiedCandidateEvidenceContextError";
  }
}

export class VerifiedCandidatePromoter {
  constructor(private readonly promoter: CandidatePromoter) {}

  promote(input: {
    tenantId: string;
    runId: string;
    branchId: string;
    expectedGeneration: number;
    baselineEvidence: EvidenceBundle;
    candidateEvidence: EvidenceBundle;
    policy: MonotonicCandidatePolicy;
  }): { pointer: Readonly<BranchPointer>; decision: MonotonicCandidateDecision } {
    if (
      input.baselineEvidence.tenantId !== input.tenantId ||
      input.candidateEvidence.tenantId !== input.tenantId
    ) {
      throw new VerifiedCandidateEvidenceContextError("tenantId");
    }
    if (
      input.baselineEvidence.runId !== input.runId ||
      input.candidateEvidence.runId !== input.runId
    ) {
      throw new VerifiedCandidateEvidenceContextError("runId");
    }
    if (input.candidateEvidence.branchId !== input.branchId) {
      throw new VerifiedCandidateEvidenceContextError("branchId");
    }
    const decision = evaluateMonotonicCandidate(
      input.baselineEvidence,
      input.candidateEvidence,
      input.policy
    );
    if (!decision.passed) throw new VerifiedCandidatePromotionError(decision);
    const pointer = this.promoter.promote({
      tenantId: input.tenantId,
      runId: input.runId,
      branchId: input.branchId,
      expectedGeneration: input.expectedGeneration,
      releaseGatePassed: true
    });
    return { pointer, decision };
  }
}
