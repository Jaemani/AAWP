import { describe, expect, it } from "vitest";
import {
  InMemoryRevisionStore,
  RevisionBranchConflictError,
  RevisionParentNotFoundError
} from "./revision.js";
import { fixtureState } from "./test-fixture.js";

describe("InMemoryRevisionStore", () => {
  it("creates an immutable child without changing its parent", () => {
    const store = new InMemoryRevisionStore();
    const parent = store.registerBase({
      revisionId: "revision-0",
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "branch-0",
      createdAt: "2026-07-14T00:00:00.000Z",
      state: fixtureState()
    });
    const child = store.createRevision({
      revisionId: "revision-1",
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "branch-1",
      parentBranchId: "branch-0",
      createdAt: "2026-07-14T00:01:00.000Z",
      patch: {
        inputArtifactHashes: { spec: "spec-b" },
        contractDigests: { "REQ-1": null }
      }
    });
    expect(parent.state.inputArtifactHashes.spec).toBe("spec-a");
    expect(parent.state.contractDigests["REQ-1"]).toBe("contract-a");
    expect(child.state.inputArtifactHashes.spec).toBe("spec-b");
    expect(child.state.contractDigests["REQ-1"]).toBeUndefined();
    expect(child.parentBranchId).toBe("branch-0");
    expect(Object.isFrozen(child.state.workflow.nodes)).toBe(true);
    expect(() => {
      (child.state.inputArtifactHashes as Record<string, string>).spec = "mutated";
    }).toThrow();
  });

  it("requires a same-run parent and unique branch ID", () => {
    const store = new InMemoryRevisionStore();
    store.registerBase({
      revisionId: "revision-0",
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "branch-0",
      createdAt: "2026-07-14T00:00:00.000Z",
      state: fixtureState()
    });
    expect(() =>
      store.createRevision({
        revisionId: "missing",
        tenantId: "tenant-b",
        runId: "run-a",
        branchId: "branch-1",
        parentBranchId: "branch-0",
        createdAt: "2026-07-14T00:01:00.000Z",
        patch: {}
      })
    ).toThrow(RevisionParentNotFoundError);
    expect(() =>
      store.registerBase({
        revisionId: "duplicate",
        tenantId: "tenant-a",
        runId: "run-a",
        branchId: "branch-0",
        createdAt: "2026-07-14T00:02:00.000Z",
        state: fixtureState()
      })
    ).toThrow(RevisionBranchConflictError);
  });
});
