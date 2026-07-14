import { describe, expect, it } from "vitest";
import {
  createEvidenceBundle,
  digestEvidenceBundle,
  EvidenceIntegrityError,
  missingRequiredEvidence,
  verifyEvidenceBundleIntegrity
} from "./evidence.js";
import { parseVerifierOutput, VerifierSchemaError } from "./schema.js";
import { evidenceBundle, verifierDefinition, verifierOutput } from "./test-fixture.js";

describe("verifier schemas and evidence bundle", () => {
  it("rejects verifier output that is not structurally complete", () => {
    expect(() => parseVerifierOutput({ outcome: "passed" })).toThrow(VerifierSchemaError);
  });

  it("normalizes evidence in stable order and produces a stable digest", () => {
    const output = verifierOutput({
      observedWrites: ["src/z.ts", "src/a.ts", "src/z.ts"],
      evidence: [...verifierOutput().evidence].reverse()
    });
    const first = evidenceBundle({ output });
    const second = evidenceBundle({ output });
    expect(first.result.observedWrites).toEqual(["src/a.ts", "src/z.ts"]);
    expect(first.result.evidence.map((item) => item.id)).toEqual([
      "build-report",
      "hidden-e2e-report"
    ]);
    expect(first.bundleId).toBe(second.bundleId);
    expect(digestEvidenceBundle(first)).toBe(digestEvidenceBundle(second));
  });

  it("records missing required evidence for the release guard", () => {
    const output = verifierOutput();
    output.evidence = output.evidence.filter((item) => item.id !== "hidden-e2e-report");
    output.findings = output.findings.map((finding) => ({
      ...finding,
      evidenceArtifactIds: []
    }));
    output.gates = output.gates.map((gate) =>
      gate.id === "hidden-e2e" ? { ...gate, evidenceArtifactIds: [] } : gate
    );
    const bundle = evidenceBundle({ output });
    expect(missingRequiredEvidence(bundle)).toEqual(["hidden-e2e-report"]);
  });

  it("freezes nested evidence and rejects dangling evidence references", () => {
    const bundle = evidenceBundle();
    expect(Object.isFrozen(bundle.result.findings[0])).toBe(true);
    expect(() => {
      bundle.result.findings[0]!.status = "resolved";
    }).toThrow();
    expect(() =>
      evidenceBundle({
        output: verifierOutput({
          findings: [
            {
              ...verifierOutput().findings[0]!,
              evidenceArtifactIds: ["missing-artifact"]
            }
          ]
        })
      })
    ).toThrow(EvidenceIntegrityError);
  });

  it("rejects duplicate stable finding ids", () => {
    const finding = verifierOutput().findings[0]!;
    expect(() =>
      createEvidenceBundle({
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "candidate",
        productArtifactId: "artifact-candidate",
        verifier: verifierDefinition(),
        startedAt: "2026-07-14T00:00:00.000Z",
        completedAt: "2026-07-14T00:00:01.000Z",
        result: verifierOutput({ findings: [finding, finding] })
      })
    ).toThrow(EvidenceIntegrityError);
  });

  it("detects evidence content changed after its bundle id was assigned", () => {
    const tampered = JSON.parse(JSON.stringify(evidenceBundle())) as ReturnType<
      typeof evidenceBundle
    >;
    tampered.result.outcome = "passed";
    expect(() => verifyEvidenceBundleIntegrity(tampered)).toThrow(EvidenceIntegrityError);
  });
});
