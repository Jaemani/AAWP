import { describe, expect, it } from "vitest";
import { evaluateMonotonicCandidate, type MonotonicCandidatePolicy } from "./guard.js";
import { evidenceBundle, passingCandidateOutput, verifierOutput } from "./test-fixture.js";

const policy: MonotonicCandidatePolicy = {
  authorizedWritePatterns: ["src/**"],
  requiredGateIds: ["build", "hidden-e2e"],
  targetFindingIds: ["finding-login"],
  maxBlockingFindings: 0,
  maxCostUsd: 1,
  maxLatencyMs: 10_000
};

function violationCodes(
  output = passingCandidateOutput(),
  overrides: Partial<MonotonicCandidatePolicy> = {}
): string[] {
  const decision = evaluateMonotonicCandidate(
    evidenceBundle(),
    evidenceBundle({ branchId: "candidate", output }),
    { ...policy, ...overrides }
  );
  return decision.violations.map((violation) => violation.code);
}

describe("monotonic candidate guard", () => {
  it("accepts a changed candidate that resolves the target without regression", () => {
    const decision = evaluateMonotonicCandidate(
      evidenceBundle(),
      evidenceBundle({ branchId: "candidate", output: passingCandidateOutput() }),
      policy
    );
    expect(decision.passed).toBe(true);
    expect(decision.metrics).toMatchObject({
      baselineOpenBlockingFindings: 1,
      candidateOpenBlockingFindings: 0,
      resolvedFindingIds: ["finding-login"]
    });
  });

  it("rejects regression of a previously passing hard gate", () => {
    const output = passingCandidateOutput({
      gates: passingCandidateOutput().gates.map((gate) =>
        gate.id === "build" ? { ...gate, status: "failed" } : gate
      )
    });
    expect(violationCodes(output)).toContain("HARD_GATE_REGRESSION");
  });

  it("rejects a no-op candidate", () => {
    expect(
      violationCodes(
        passingCandidateOutput({ productContentHash: verifierOutput().productContentHash })
      )
    ).toContain("NO_OP_CANDIDATE");
  });

  it("rejects writes outside the authorized repair set", () => {
    expect(
      violationCodes(passingCandidateOutput({ observedWrites: ["tests/hidden.spec.ts"] }))
    ).toContain("UNAUTHORIZED_WRITE");
  });

  it("rejects loss of runtime-required evidence", () => {
    const output = passingCandidateOutput();
    output.evidence = output.evidence.filter((item) => item.id !== "hidden-e2e-report");
    output.findings = output.findings.map((finding) => ({
      ...finding,
      evidenceArtifactIds: []
    }));
    output.gates = output.gates.map((gate) =>
      gate.id === "hidden-e2e" ? { ...gate, evidenceArtifactIds: [] } : gate
    );
    expect(violationCodes(output)).toContain("REQUIRED_EVIDENCE_LOST");
  });

  it("rejects a new blocking finding even when the target is resolved", () => {
    const output = passingCandidateOutput();
    output.findings.push({
      ...verifierOutput().findings[0]!,
      id: "finding-regression",
      reasonCode: "REGRESSION",
      status: "open"
    });
    expect(violationCodes(output, { maxBlockingFindings: 1 })).toContain("NEW_BLOCKING_FINDING");
  });

  it("rejects finding identity changes and non-passing verifier outcomes", () => {
    const output = passingCandidateOutput({ outcome: "inconclusive" });
    output.findings = output.findings.map((finding) => ({
      ...finding,
      severity: "low"
    }));
    const codes = violationCodes(output);
    expect(codes).toContain("FINDING_IDENTITY_CHANGED");
    expect(codes).toContain("VERIFIER_OUTCOME_NOT_PASSED");
  });
});
