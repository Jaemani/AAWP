import {
  CandidatePromoter,
  InMemoryBranchPointerStore,
  InMemoryRevisionStore,
  type RevisionState
} from "@awf/impact-engine";
import { describe, expect, it } from "vitest";
import {
  VerifiedCandidateEvidenceContextError,
  VerifiedCandidatePromoter,
  VerifiedCandidatePromotionError
} from "./promotion.js";
import { evidenceBundle, passingCandidateOutput } from "./test-fixture.js";

const workflow: RevisionState["workflow"] = {
  apiVersion: "awf/v1",
  id: "verify-promotion",
  version: "1.0.0",
  mode: "CONTRACT",
  artifactSchemas: [{ type: "empty", schemaVersion: "1", schema: { type: "object" } }],
  inputs: {},
  outputs: {},
  verifierDefinitions: [],
  scopePolicy: {},
  nodes: [],
  edges: [],
  releasePolicy: { requiredVerifiers: [], maxBlockingFindings: 0 }
};

function setup(): {
  verified: VerifiedCandidatePromoter;
  pointers: InMemoryBranchPointerStore;
} {
  const revisions = new InMemoryRevisionStore();
  revisions.registerBase({
    revisionId: "revision-main",
    tenantId: "tenant-a",
    runId: "run-a",
    branchId: "main",
    createdAt: "2026-07-14T00:00:00.000Z",
    state: {
      workflow,
      inputArtifactHashes: {},
      contractDigests: {},
      contractConsumers: {},
      executionProfiles: {}
    }
  });
  revisions.createRevision({
    revisionId: "revision-candidate",
    tenantId: "tenant-a",
    runId: "run-a",
    branchId: "candidate",
    parentBranchId: "main",
    createdAt: "2026-07-14T00:01:00.000Z",
    patch: {}
  });
  const pointers = new InMemoryBranchPointerStore();
  pointers.register({ tenantId: "tenant-a", runId: "run-a", activeBranchId: "main" });
  return {
    verified: new VerifiedCandidatePromoter(new CandidatePromoter(revisions, pointers)),
    pointers
  };
}

const candidatePolicy = {
  authorizedWritePatterns: ["src/**"],
  requiredGateIds: ["build", "hidden-e2e"],
  targetFindingIds: ["finding-login"],
  maxBlockingFindings: 0
};

describe("verified candidate promotion", () => {
  it("promotes only after the evidence-backed monotonic guard passes", () => {
    const { verified, pointers } = setup();
    const result = verified.promote({
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "candidate",
      expectedGeneration: 0,
      baselineEvidence: evidenceBundle(),
      candidateEvidence: evidenceBundle({
        branchId: "candidate",
        output: passingCandidateOutput()
      }),
      policy: candidatePolicy
    });
    expect(result.decision.passed).toBe(true);
    expect(result.pointer).toMatchObject({ activeBranchId: "candidate", generation: 1 });
    expect(pointers.get("tenant-a", "run-a")?.activeBranchId).toBe("candidate");
  });

  it("preserves the active branch when verification fails", () => {
    const { verified, pointers } = setup();
    expect(() =>
      verified.promote({
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "candidate",
        expectedGeneration: 0,
        baselineEvidence: evidenceBundle(),
        candidateEvidence: evidenceBundle({
          branchId: "candidate",
          output: passingCandidateOutput({ productContentHash: "a".repeat(64) })
        }),
        policy: candidatePolicy
      })
    ).toThrow(VerifiedCandidatePromotionError);
    expect(pointers.get("tenant-a", "run-a")).toMatchObject({
      activeBranchId: "main",
      generation: 0
    });
  });

  it("rejects evidence produced for another candidate branch", () => {
    const { verified, pointers } = setup();
    expect(() =>
      verified.promote({
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "candidate",
        expectedGeneration: 0,
        baselineEvidence: evidenceBundle(),
        candidateEvidence: evidenceBundle({
          branchId: "other-candidate",
          output: passingCandidateOutput()
        }),
        policy: candidatePolicy
      })
    ).toThrow(VerifiedCandidateEvidenceContextError);
    expect(pointers.get("tenant-a", "run-a")?.activeBranchId).toBe("main");
  });
});
