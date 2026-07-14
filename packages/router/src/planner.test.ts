import { describe, expect, it } from "vitest";
import {
  InMemoryPlanStore,
  PlanValidationError,
  selectNextBranches,
  type PlanBranch
} from "./planner.js";

function branch(id: string, gain: number, cost: number, partition = `research/${id}`): PlanBranch {
  return {
    id,
    question: `Investigate ${id}`,
    artifactPartition: partition,
    outputSchemaDigest: `schema-${id}`,
    expectedInformationGain: gain,
    maxCostUsd: cost,
    status: "pending",
    evidenceArtifactIds: []
  };
}

describe("versioned explorer plans", () => {
  it("preserves v1 while recording evidence and status in v2", () => {
    const store = new InMemoryPlanStore();
    const first = store.create({
      planId: "plan-a",
      goalContractDigest: "goal-v1",
      reason: "initial hypotheses",
      branches: [branch("market", 0.8, 1), branch("technical", 0.6, 0.5)],
      createdAt: "2026-07-14T00:00:00.000Z"
    });
    const second = store.revise({
      planId: "plan-a",
      expectedVersion: 1,
      reason: "technical evidence received",
      branchUpdates: [
        {
          id: "technical",
          status: "running",
          evidenceArtifactIds: ["artifact-technical"]
        }
      ],
      evidenceArtifactIds: ["artifact-technical"],
      createdAt: "2026-07-14T00:01:00.000Z"
    });
    expect(second).toMatchObject({ version: 2, parentDigest: first.digest });
    expect(second.digest).not.toBe(first.digest);
    expect(store.get("plan-a", 1)).toEqual(first);
    expect(first.branches.find((item) => item.id === "technical")?.status).toBe("pending");
    expect(Object.isFrozen(second.branches[0])).toBe(true);
  });

  it("selects high information gain per cost within hard budgets", () => {
    const plan = new InMemoryPlanStore().create({
      planId: "plan-budget",
      goalContractDigest: "goal",
      reason: "rank branches",
      branches: [
        branch("expensive", 0.9, 2),
        branch("efficient", 0.8, 0.5),
        branch("low", 0.1, 0.1)
      ],
      createdAt: "2026-07-14T00:00:00.000Z"
    });
    expect(
      selectNextBranches(plan, {
        maxBranches: 2,
        remainingCostUsd: 1,
        minInformationGain: 0.2
      }).map((item) => item.id)
    ).toEqual(["efficient"]);
  });

  it("rejects shared mutable partitions, stale revisions and completed-branch reopening", () => {
    const store = new InMemoryPlanStore();
    expect(() =>
      store.create({
        planId: "bad",
        goalContractDigest: "goal",
        reason: "bad partition",
        branches: [branch("a", 0.5, 1, "shared"), branch("b", 0.5, 1, "shared")],
        createdAt: "2026-07-14T00:00:00.000Z"
      })
    ).toThrowError(expect.objectContaining({ code: "ARTIFACT_PARTITION_CONFLICT" }));

    store.create({
      planId: "plan-state",
      goalContractDigest: "goal",
      reason: "state changes",
      branches: [{ ...branch("a", 0.5, 1), status: "running" }],
      createdAt: "2026-07-14T00:00:00.000Z"
    });
    store.revise({
      planId: "plan-state",
      expectedVersion: 1,
      reason: "complete",
      branchUpdates: [{ id: "a", status: "completed" }],
      createdAt: "2026-07-14T00:01:00.000Z"
    });
    expect(() =>
      store.revise({
        planId: "plan-state",
        expectedVersion: 2,
        reason: "illegal reopen",
        branchUpdates: [{ id: "a", status: "running" }],
        createdAt: "2026-07-14T00:02:00.000Z"
      })
    ).toThrow(PlanValidationError);
    expect(() =>
      store.revise({
        planId: "plan-state",
        expectedVersion: 1,
        reason: "stale",
        createdAt: "2026-07-14T00:03:00.000Z"
      })
    ).toThrowError(expect.objectContaining({ code: "PLAN_VERSION_CONFLICT" }));
  });
});
