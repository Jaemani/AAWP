import { verifyEvidenceBundleIntegrity } from "./evidence.js";
import { reconcileFindings } from "./classification.js";
import type { EvidenceBundle, Finding, GateResult } from "./schema.js";

export type MonotonicViolationCode =
  | "HARD_GATE_REGRESSION"
  | "REQUIRED_GATE_NOT_PASSED"
  | "NEW_BLOCKING_FINDING"
  | "FINDING_IDENTITY_CHANGED"
  | "OPEN_FINDING_DISAPPEARED"
  | "SCOPE_VIOLATION_INCREASED"
  | "REQUIRED_EVIDENCE_LOST"
  | "VERIFIER_ID_CHANGED"
  | "VERIFIER_VERSION_CHANGED"
  | "VERIFIER_OWNER_CHANGED"
  | "VERIFIER_VISIBILITY_CHANGED"
  | "VERIFIER_POLICY_CHANGED"
  | "VERIFIER_IMAGE_CHANGED"
  | "TENANT_CONTEXT_CHANGED"
  | "RUN_CONTEXT_CHANGED"
  | "VERIFIER_OUTCOME_NOT_PASSED"
  | "UNAUTHORIZED_WRITE"
  | "NO_OP_CANDIDATE"
  | "BLOCKING_SCORE_NOT_IMPROVED"
  | "TARGET_FINDING_UNRESOLVED"
  | "BLOCKING_FINDING_LIMIT_EXCEEDED"
  | "COST_LIMIT_EXCEEDED"
  | "LATENCY_LIMIT_EXCEEDED";

export interface MonotonicViolation {
  code: MonotonicViolationCode;
  source: string;
}

export interface MonotonicCandidatePolicy {
  authorizedWritePatterns: string[];
  requiredGateIds: string[];
  targetFindingIds: string[];
  maxBlockingFindings: number;
  maxCostUsd?: number;
  maxLatencyMs?: number;
  requireProductChange?: boolean;
}

export interface MonotonicCandidateDecision {
  passed: boolean;
  violations: MonotonicViolation[];
  metrics: {
    baselineBlockingScore: number;
    candidateBlockingScore: number;
    baselineOpenBlockingFindings: number;
    candidateOpenBlockingFindings: number;
    resolvedFindingIds: string[];
  };
}

const severityWeight: Record<Finding["severity"], number> = {
  blocking: 1000,
  high: 100,
  medium: 10,
  low: 1
};

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path.startsWith(`${prefix}/`);
  }
  return pattern === path;
}

function blockingScore(findings: ReadonlyArray<Finding>): number {
  return findings
    .filter((finding) => finding.status === "open")
    .reduce((sum, finding) => sum + severityWeight[finding.severity], 0);
}

function openBlocking(findings: ReadonlyArray<Finding>): Finding[] {
  return findings.filter((finding) => finding.status === "open" && finding.severity === "blocking");
}

function gatesById(gates: ReadonlyArray<GateResult>): Map<string, GateResult> {
  return new Map(gates.map((gate) => [gate.id, gate]));
}

function compareVerifier(
  baseline: EvidenceBundle,
  candidate: EvidenceBundle,
  violations: MonotonicViolation[]
): void {
  const fields: Array<{
    key: keyof EvidenceBundle["verifier"];
    code:
      | "VERIFIER_ID_CHANGED"
      | "VERIFIER_VERSION_CHANGED"
      | "VERIFIER_OWNER_CHANGED"
      | "VERIFIER_VISIBILITY_CHANGED"
      | "VERIFIER_POLICY_CHANGED"
      | "VERIFIER_IMAGE_CHANGED";
  }> = [
    { key: "id", code: "VERIFIER_ID_CHANGED" },
    { key: "version", code: "VERIFIER_VERSION_CHANGED" },
    { key: "ownerId", code: "VERIFIER_OWNER_CHANGED" },
    { key: "visibility", code: "VERIFIER_VISIBILITY_CHANGED" },
    { key: "policyDigest", code: "VERIFIER_POLICY_CHANGED" },
    { key: "image", code: "VERIFIER_IMAGE_CHANGED" }
  ];
  for (const field of fields) {
    if (baseline.verifier[field.key] !== candidate.verifier[field.key]) {
      violations.push({ code: field.code, source: field.key });
    }
  }
}

export function evaluateMonotonicCandidate(
  baseline: EvidenceBundle,
  candidate: EvidenceBundle,
  policy: MonotonicCandidatePolicy
): MonotonicCandidateDecision {
  verifyEvidenceBundleIntegrity(baseline);
  verifyEvidenceBundleIntegrity(candidate);
  const violations: MonotonicViolation[] = [];
  compareVerifier(baseline, candidate, violations);
  if (baseline.tenantId !== candidate.tenantId) {
    violations.push({ code: "TENANT_CONTEXT_CHANGED", source: candidate.tenantId });
  }
  if (baseline.runId !== candidate.runId) {
    violations.push({ code: "RUN_CONTEXT_CHANGED", source: candidate.runId });
  }
  if (candidate.result.outcome !== "passed") {
    violations.push({ code: "VERIFIER_OUTCOME_NOT_PASSED", source: candidate.result.outcome });
  }

  const candidateGates = gatesById(candidate.result.gates);
  for (const gate of baseline.result.gates) {
    if (gate.hard && gate.status === "passed" && candidateGates.get(gate.id)?.status !== "passed") {
      violations.push({ code: "HARD_GATE_REGRESSION", source: gate.id });
    }
  }
  for (const gateId of [...new Set(policy.requiredGateIds)].sort()) {
    if (candidateGates.get(gateId)?.status !== "passed") {
      violations.push({ code: "REQUIRED_GATE_NOT_PASSED", source: gateId });
    }
  }

  const reconciliation = reconcileFindings(baseline.result.findings, candidate.result.findings);
  const candidateFindings = new Map(
    candidate.result.findings.map((finding) => [finding.id, finding])
  );
  for (const finding of baseline.result.findings) {
    const next = candidateFindings.get(finding.id);
    if (next === undefined) continue;
    const identityBefore = [
      finding.verifierId,
      finding.requirementId ?? "",
      finding.class,
      finding.severity,
      finding.reasonCode
    ].join("\0");
    const identityAfter = [
      next.verifierId,
      next.requirementId ?? "",
      next.class,
      next.severity,
      next.reasonCode
    ].join("\0");
    if (identityBefore !== identityAfter) {
      violations.push({ code: "FINDING_IDENTITY_CHANGED", source: finding.id });
    }
  }
  for (const findingId of reconciliation.missingOpenIds) {
    violations.push({ code: "OPEN_FINDING_DISAPPEARED", source: findingId });
  }
  const baselineIds = new Set(baseline.result.findings.map((finding) => finding.id));
  for (const finding of candidate.result.findings) {
    if (
      !baselineIds.has(finding.id) &&
      finding.status === "open" &&
      finding.severity === "blocking"
    ) {
      violations.push({ code: "NEW_BLOCKING_FINDING", source: finding.id });
    }
  }
  for (const findingId of [...new Set(policy.targetFindingIds)].sort()) {
    const finding = candidate.result.findings.find((item) => item.id === findingId);
    if (finding?.status !== "resolved" && finding?.status !== "waived") {
      violations.push({ code: "TARGET_FINDING_UNRESOLVED", source: findingId });
    }
  }

  if (candidate.result.scopeViolationCount > baseline.result.scopeViolationCount) {
    violations.push({
      code: "SCOPE_VIOLATION_INCREASED",
      source: `${baseline.result.scopeViolationCount}->${candidate.result.scopeViolationCount}`
    });
  }

  const requiredEvidenceIds = new Set([
    ...baseline.requiredEvidenceIds,
    ...baseline.result.evidence.filter((item) => item.required).map((item) => item.id),
    ...candidate.requiredEvidenceIds
  ]);
  const candidateEvidenceIds = new Set(candidate.result.evidence.map((item) => item.id));
  for (const evidenceId of [...requiredEvidenceIds].sort()) {
    if (!candidateEvidenceIds.has(evidenceId)) {
      violations.push({ code: "REQUIRED_EVIDENCE_LOST", source: evidenceId });
    }
  }
  for (const path of candidate.result.observedWrites) {
    if (!policy.authorizedWritePatterns.some((pattern) => pathMatches(pattern, path))) {
      violations.push({ code: "UNAUTHORIZED_WRITE", source: path });
    }
  }

  if (
    (policy.requireProductChange ?? true) &&
    candidate.result.productContentHash === baseline.result.productContentHash
  ) {
    violations.push({ code: "NO_OP_CANDIDATE", source: candidate.result.productContentHash });
  }

  const beforeScore = blockingScore(baseline.result.findings);
  const afterScore = blockingScore(candidate.result.findings);
  const allTargetsResolved = policy.targetFindingIds.every((findingId) =>
    candidate.result.findings.some(
      (finding) =>
        finding.id === findingId && (finding.status === "resolved" || finding.status === "waived")
    )
  );
  if (afterScore > beforeScore || (afterScore === beforeScore && !allTargetsResolved)) {
    violations.push({
      code: "BLOCKING_SCORE_NOT_IMPROVED",
      source: `${beforeScore}->${afterScore}`
    });
  }

  const candidateBlocking = openBlocking(candidate.result.findings);
  if (candidateBlocking.length > policy.maxBlockingFindings) {
    violations.push({
      code: "BLOCKING_FINDING_LIMIT_EXCEEDED",
      source: `${candidateBlocking.length}>${policy.maxBlockingFindings}`
    });
  }
  if (policy.maxCostUsd !== undefined && candidate.result.costUsd > policy.maxCostUsd) {
    violations.push({
      code: "COST_LIMIT_EXCEEDED",
      source: `${candidate.result.costUsd}>${policy.maxCostUsd}`
    });
  }
  if (policy.maxLatencyMs !== undefined && candidate.result.latencyMs > policy.maxLatencyMs) {
    violations.push({
      code: "LATENCY_LIMIT_EXCEEDED",
      source: `${candidate.result.latencyMs}>${policy.maxLatencyMs}`
    });
  }

  const stableViolations = violations.sort((left, right) => {
    const leftKey = `${left.code}\0${left.source}`;
    const rightKey = `${right.code}\0${right.source}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return {
    passed: stableViolations.length === 0,
    violations: stableViolations,
    metrics: {
      baselineBlockingScore: beforeScore,
      candidateBlockingScore: afterScore,
      baselineOpenBlockingFindings: openBlocking(baseline.result.findings).length,
      candidateOpenBlockingFindings: candidateBlocking.length,
      resolvedFindingIds: reconciliation.resolvedIds
    }
  };
}
