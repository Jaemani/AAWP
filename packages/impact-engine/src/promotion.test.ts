import { describe, expect, it } from "vitest";
import {
  BranchPointerConflictError,
  CandidatePromoter,
  CandidateReleaseGateError,
  InMemoryBranchPointerStore
} from "./promotion.js";
import { InMemoryRevisionStore } from "./revision.js";
import { fixtureState } from "./test-fixture.js";

function setup(): {
  revisions: InMemoryRevisionStore;
  pointers: InMemoryBranchPointerStore;
  promoter: CandidatePromoter;
} {
  const revisions = new InMemoryRevisionStore();
  revisions.registerBase({
    revisionId: "revision-0",
    tenantId: "tenant-a",
    runId: "run-a",
    branchId: "branch-0",
    createdAt: "2026-07-14T00:00:00.000Z",
    state: fixtureState()
  });
  for (const branchId of ["branch-1", "branch-2"]) {
    revisions.createRevision({
      revisionId: `revision-${branchId.at(-1)}`,
      tenantId: "tenant-a",
      runId: "run-a",
      branchId,
      parentBranchId: "branch-0",
      createdAt: "2026-07-14T00:01:00.000Z",
      patch: { inputArtifactHashes: { spec: `spec-${branchId}` } }
    });
  }
  const pointers = new InMemoryBranchPointerStore();
  pointers.register({ tenantId: "tenant-a", runId: "run-a", activeBranchId: "branch-0" });
  return { revisions, pointers, promoter: new CandidatePromoter(revisions, pointers) };
}

describe("candidate promotion and rollback", () => {
  it("keeps the parent active when the release gate fails", () => {
    const { pointers, promoter } = setup();
    expect(() =>
      promoter.promote({
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "branch-1",
        expectedGeneration: 0,
        releaseGatePassed: false
      })
    ).toThrow(CandidateReleaseGateError);
    expect(pointers.get("tenant-a", "run-a")).toMatchObject({
      activeBranchId: "branch-0",
      generation: 0
    });
  });

  it("uses compare-and-swap so one concurrent promotion loses", () => {
    const { pointers, promoter } = setup();
    promoter.promote({
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "branch-1",
      expectedGeneration: 0,
      releaseGatePassed: true
    });
    expect(() =>
      promoter.promote({
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "branch-2",
        expectedGeneration: 0,
        releaseGatePassed: true
      })
    ).toThrow(BranchPointerConflictError);
    expect(pointers.get("tenant-a", "run-a")).toMatchObject({
      activeBranchId: "branch-1",
      generation: 1
    });
  });

  it("rolls back by CAS to a preserved immutable parent branch", () => {
    const { revisions, pointers, promoter } = setup();
    promoter.promote({
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "branch-1",
      expectedGeneration: 0,
      releaseGatePassed: true
    });
    promoter.rollback({
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "branch-0",
      expectedGeneration: 1
    });
    expect(pointers.get("tenant-a", "run-a")).toMatchObject({
      activeBranchId: "branch-0",
      generation: 2
    });
    expect(revisions.get("tenant-a", "run-a", "branch-0")?.state.inputArtifactHashes.spec).toBe(
      "spec-a"
    );
  });
});
