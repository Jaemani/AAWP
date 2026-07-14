import { describe, expect, it } from "vitest";
import type { StoredRunEvent } from "@awf/runtime-core";
import { projectEvidence, projectRunControl } from "./projection.js";
import { fixtureEvidence } from "./test-fixture.js";

function event(sequence: number, type: StoredRunEvent["type"], payload: unknown): StoredRunEvent {
  return {
    tenantId: "tenant-a",
    runId: "run-a",
    eventKey: `event-${sequence}`,
    sequence,
    type,
    occurredAt: `2026-07-01T00:00:0${sequence}.000Z`,
    payload
  };
}

describe("run and evidence projections", () => {
  it("builds timeline, approvals, budgets and secret references from events", () => {
    const projection = projectRunControl([
      event(1, "RunCreated", { budget: { maxCostUsd: 1, maxTokens: 1000 } }),
      event(2, "RoutingDecided", {
        mode: "CONTRACT",
        checkpoint: "durable",
        workflowGain: 4,
        policyVersion: "value-router/v1"
      }),
      event(3, "ApprovalRequested", {
        approvalId: "approval-1",
        nodeId: "release",
        prompt: "Promote candidate?"
      }),
      event(4, "ToolInvoked", {
        nodeId: "build",
        costUsd: 0.2,
        tokens: 100,
        secretRefIds: ["github-token-ref"]
      }),
      event(5, "ArtifactPublished", { artifactId: "artifact-child" }),
      event(6, "ApprovalResolved", { approvalId: "approval-1", decision: "approved" }),
      event(7, "RunCompleted", {})
    ]);

    expect(projection.status).toBe("completed");
    expect(projection.budget).toEqual({
      costUsd: 0.2,
      tokens: 100,
      maxCostUsd: 1,
      maxTokens: 1000
    });
    expect(projection.approvals).toMatchObject([{ approvalId: "approval-1", status: "approved" }]);
    expect(projection.referencedSecretIds).toEqual(["github-token-ref"]);
    expect(projection.artifactIds).toEqual(["artifact-child"]);
    expect(projection.availableCommands).toEqual([]);
  });

  it("removes hidden verifier details unless access is explicit", () => {
    const bundle = fixtureEvidence();

    const hidden = projectEvidence([bundle], { canViewHiddenVerifier: false });
    expect(hidden).toEqual([
      {
        bundleId: bundle.bundleId,
        verifierId: "hidden-release",
        visibility: "hidden",
        outcome: "failed",
        redacted: true
      }
    ]);
    const privileged = projectEvidence([bundle], { canViewHiddenVerifier: true });
    expect(privileged[0]).toMatchObject({
      redacted: false,
      findings: [{ reasonCode: "HIDDEN_EXPECTATION" }]
    });
  });

  it("keeps a paused run paused when only an approval is resolved", () => {
    const projection = projectRunControl([
      event(1, "RunCreated", {}),
      event(2, "ApprovalRequested", { approvalId: "approval-1" }),
      event(3, "RunPaused", {}),
      event(4, "ApprovalResolved", { approvalId: "approval-1", decision: "approved" })
    ]);

    expect(projection.status).toBe("paused");
    expect(projection.availableCommands.map((item) => item.command)).toEqual(["resume", "cancel"]);
  });
});
