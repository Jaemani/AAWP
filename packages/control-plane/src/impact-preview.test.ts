import { describe, expect, it } from "vitest";
import { previewRevisionImpact } from "./impact-preview.js";
import { fixtureState, fixtureWorkflow } from "./test-fixture.js";

describe("revision impact preview", () => {
  it("uses changed roots and downstream closure from the impact engine", () => {
    const parentWorkflow = fixtureWorkflow();
    const candidateWorkflow = structuredClone(parentWorkflow);
    const build = candidateWorkflow.nodes.find((node) => node.id === "build")!;
    build.budget.timeoutSec = 120;

    const preview = previewRevisionImpact({
      parent: fixtureState(parentWorkflow),
      candidate: fixtureState(candidateWorkflow)
    });

    expect(preview.summary).toEqual({
      changedRoots: 1,
      removedNodes: 0,
      rerunNodes: 2,
      reusedNodes: 0,
      unsafe: false
    });
    expect(preview.impact.decisions).toMatchObject([
      { nodeId: "build", action: "rerun" },
      { nodeId: "verify", action: "rerun", reasons: [{ code: "UPSTREAM_INVALIDATED" }] }
    ]);
  });
});
