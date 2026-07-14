import type { Finding, FindingClass } from "./schema.js";

export type FailureSignalKind =
  | "behavior_mismatch"
  | "acceptance_ambiguity"
  | "verifier_malfunction"
  | "resource_exhausted"
  | "forbidden_effect"
  | "insufficient_evidence";

export type RepairLane =
  "product" | "verifier_contract" | "harness" | "infrastructure" | "policy" | "investigation";

export type RepairActorRole = "builder" | "verifier" | "operator" | "policy_owner";

export interface RepairAuthorization {
  authorized: boolean;
  lane: RepairLane;
  allowedWrites: string[];
  reasonCode: string;
}

const classBySignal: Record<FailureSignalKind, FindingClass> = {
  behavior_mismatch: "product_defect",
  acceptance_ambiguity: "test_contract_defect",
  verifier_malfunction: "harness_defect",
  resource_exhausted: "infra_capacity",
  forbidden_effect: "policy_violation",
  insufficient_evidence: "inconclusive"
};

const laneByClass: Record<FindingClass, RepairLane> = {
  product_defect: "product",
  test_contract_defect: "verifier_contract",
  harness_defect: "harness",
  infra_capacity: "infrastructure",
  policy_violation: "policy",
  inconclusive: "investigation"
};

const roleByClass: Partial<Record<FindingClass, RepairActorRole>> = {
  product_defect: "builder",
  test_contract_defect: "verifier",
  harness_defect: "operator",
  infra_capacity: "operator"
};

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path.startsWith(`${prefix}/`);
  }
  return pattern === path;
}

export function classifyFailure(signal: FailureSignalKind): FindingClass {
  return classBySignal[signal];
}

export function authorizeRepair(
  finding: Finding,
  request: { actorRole: RepairActorRole; requestedWrites: string[] }
): RepairAuthorization {
  const lane = laneByClass[finding.class];
  const requiredRole = roleByClass[finding.class];
  if (requiredRole === undefined) {
    return {
      authorized: false,
      lane,
      allowedWrites: [],
      reasonCode:
        finding.class === "policy_violation"
          ? "POLICY_REQUIRES_HUMAN_DECISION"
          : "INCONCLUSIVE_REQUIRES_INVESTIGATION"
    };
  }
  if (request.actorRole !== requiredRole) {
    return {
      authorized: false,
      lane,
      allowedWrites: [],
      reasonCode: "ACTOR_ROLE_NOT_AUTHORIZED"
    };
  }
  if (finding.class === "infra_capacity") {
    return {
      authorized: request.requestedWrites.length === 0,
      lane,
      allowedWrites: [],
      reasonCode:
        request.requestedWrites.length === 0 ? "INFRA_RETRY_AUTHORIZED" : "INFRA_RETRY_CANNOT_WRITE"
    };
  }
  const unauthorized = request.requestedWrites.filter(
    (path) => !finding.allowedRepairWrites.some((pattern) => pathMatches(pattern, path))
  );
  return {
    authorized: unauthorized.length === 0,
    lane,
    allowedWrites: [...finding.allowedRepairWrites].sort(),
    reasonCode: unauthorized.length === 0 ? "REPAIR_AUTHORIZED" : "WRITE_OUTSIDE_REPAIR_SCOPE"
  };
}

export interface FindingReconciliation {
  resolvedIds: string[];
  introducedIds: string[];
  missingOpenIds: string[];
}

export function reconcileFindings(
  baseline: ReadonlyArray<Finding>,
  candidate: ReadonlyArray<Finding>
): FindingReconciliation {
  const before = new Map(baseline.map((finding) => [finding.id, finding]));
  const after = new Map(candidate.map((finding) => [finding.id, finding]));
  const resolvedIds: string[] = [];
  const missingOpenIds: string[] = [];
  for (const finding of baseline) {
    if (finding.status !== "open") continue;
    const next = after.get(finding.id);
    if (next === undefined) missingOpenIds.push(finding.id);
    else if (next.status === "resolved" || next.status === "waived") resolvedIds.push(finding.id);
  }
  return {
    resolvedIds: resolvedIds.sort(),
    introducedIds: candidate
      .filter((finding) => !before.has(finding.id))
      .map((finding) => finding.id)
      .sort(),
    missingOpenIds: missingOpenIds.sort()
  };
}
