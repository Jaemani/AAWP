import { createEvidenceBundle } from "./evidence.js";
import type { EvidenceBundle, VerifierDefinition, VerifierOutput } from "./schema.js";

export const baselineHash = "a".repeat(64);
export const candidateHash = "b".repeat(64);

export function verifierDefinition(
  overrides: Partial<VerifierDefinition> = {}
): VerifierDefinition {
  return {
    id: "hidden-e2e",
    version: "1.0.0",
    ownerId: "acceptance-team",
    visibility: "hidden",
    image: `registry.example/awf/verifier@sha256:${"c".repeat(64)}`,
    argv: ["verify", "--json"],
    policyDigest: "d".repeat(64),
    requiredEvidenceIds: ["hidden-e2e-report"],
    ...overrides
  };
}

export function verifierOutput(overrides: Partial<VerifierOutput> = {}): VerifierOutput {
  return {
    outcome: "failed",
    productContentHash: baselineHash,
    findings: [
      {
        id: "finding-login",
        requirementId: "REQ-LOGIN",
        verifierId: "hidden-e2e",
        class: "product_defect",
        severity: "blocking",
        reasonCode: "LOGIN_REDIRECT_MISSING",
        evidenceArtifactIds: ["artifact-e2e"],
        affectedPaths: ["src/login.ts"],
        allowedRepairWrites: ["src/**"],
        status: "open"
      }
    ],
    gates: [
      {
        id: "build",
        hard: true,
        status: "passed",
        evidenceArtifactIds: ["artifact-build"]
      },
      {
        id: "hidden-e2e",
        hard: true,
        status: "failed",
        evidenceArtifactIds: ["artifact-e2e"]
      }
    ],
    evidence: [
      {
        id: "hidden-e2e-report",
        kind: "test_report",
        artifactId: "artifact-e2e",
        contentHash: "e".repeat(64),
        required: true
      },
      {
        id: "build-report",
        kind: "command_log",
        artifactId: "artifact-build",
        contentHash: "f".repeat(64),
        required: true
      }
    ],
    observedWrites: [],
    scopeViolationCount: 0,
    costUsd: 0.02,
    latencyMs: 100,
    ...overrides
  };
}

export function evidenceBundle(
  input: {
    branchId?: string;
    definition?: VerifierDefinition;
    output?: VerifierOutput;
  } = {}
): EvidenceBundle {
  return createEvidenceBundle({
    tenantId: "tenant-a",
    runId: "run-a",
    branchId: input.branchId ?? "main",
    productArtifactId: `artifact-${input.branchId ?? "main"}`,
    verifier: input.definition ?? verifierDefinition(),
    startedAt: "2026-07-14T00:00:00.000Z",
    completedAt: "2026-07-14T00:00:01.000Z",
    result: input.output ?? verifierOutput()
  });
}

export function passingCandidateOutput(overrides: Partial<VerifierOutput> = {}): VerifierOutput {
  const baseline = verifierOutput();
  return {
    ...baseline,
    outcome: "passed",
    productContentHash: candidateHash,
    findings: baseline.findings.map((finding) => ({ ...finding, status: "resolved" as const })),
    gates: baseline.gates.map((gate) => ({ ...gate, status: "passed" as const })),
    observedWrites: ["src/login.ts"],
    costUsd: 0.03,
    latencyMs: 120,
    ...overrides
  };
}
