import {
  authorizeRepair,
  evaluateMonotonicCandidate,
  type EvidenceBundle,
  type Finding,
  type MonotonicCandidateDecision,
  type MonotonicCandidatePolicy,
  type RepairActorRole
} from "@awf/verifier-sdk";

export interface BoundedRepairPolicy {
  maxRounds: number;
  maxRepeatedFinding: number;
}

export interface AuthorizedRepairRound {
  round: number;
  targetFindingIds: string[];
  allowedWrites: string[];
}

export class RepairLoopError extends Error {
  constructor(
    readonly code:
      | "MAX_ROUNDS_REACHED"
      | "NO_OPEN_FINDINGS"
      | "REPEATED_FINDING_LIMIT"
      | "REPAIR_NOT_AUTHORIZED",
    message: string
  ) {
    super(message);
    this.name = "RepairLoopError";
  }
}

export class BoundedRepairController {
  private round = 0;
  private readonly occurrences = new Map<string, number>();

  constructor(private readonly policy: BoundedRepairPolicy) {
    if (
      !Number.isInteger(policy.maxRounds) ||
      policy.maxRounds < 1 ||
      !Number.isInteger(policy.maxRepeatedFinding) ||
      policy.maxRepeatedFinding < 1
    ) {
      throw new Error("repair bounds must be positive integers");
    }
  }

  authorize(input: {
    findings: Finding[];
    actorRole: RepairActorRole;
    requestedWrites: string[];
  }): AuthorizedRepairRound {
    if (this.round >= this.policy.maxRounds) {
      throw new RepairLoopError("MAX_ROUNDS_REACHED", "repair round budget exhausted");
    }
    const open = input.findings.filter((finding) => finding.status === "open");
    if (open.length === 0) {
      throw new RepairLoopError("NO_OPEN_FINDINGS", "repair requires an open finding");
    }
    const allowedWrites = new Set<string>();
    for (const finding of open) {
      const seen = (this.occurrences.get(finding.id) ?? 0) + 1;
      if (seen > this.policy.maxRepeatedFinding) {
        throw new RepairLoopError(
          "REPEATED_FINDING_LIMIT",
          `finding ${finding.id} repeated ${seen} times`
        );
      }
      const authorization = authorizeRepair(finding, {
        actorRole: input.actorRole,
        requestedWrites: input.requestedWrites
      });
      if (!authorization.authorized) {
        throw new RepairLoopError(
          "REPAIR_NOT_AUTHORIZED",
          `${finding.id}: ${authorization.reasonCode}`
        );
      }
      this.occurrences.set(finding.id, seen);
      for (const write of authorization.allowedWrites) allowedWrites.add(write);
    }
    this.round += 1;
    return {
      round: this.round,
      targetFindingIds: open.map((finding) => finding.id).sort(),
      allowedWrites: [...allowedWrites].sort()
    };
  }

  evaluateCandidate(input: {
    baseline: EvidenceBundle;
    candidate: EvidenceBundle;
    policy: MonotonicCandidatePolicy;
  }): MonotonicCandidateDecision {
    return evaluateMonotonicCandidate(input.baseline, input.candidate, input.policy);
  }
}
