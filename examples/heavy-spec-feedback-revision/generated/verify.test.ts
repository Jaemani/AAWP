import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { digestWorkflow } from "@awf/ir";
import { createHeavyProductionSpecValidator } from "@awf/spec-feedback-to-spec";

type JsonRecord = Record<string, unknown>;

const candidate = JSON.parse(
  await readFile(
    "examples/heavy-spec-feedback-revision/generated/refined-production-spec.role-workspaces.candidate.json",
    "utf8"
  )
) as JsonRecord;
const proposal = JSON.parse(
  await readFile("examples/heavy-spec-feedback-revision/generated/patch-proposal.json", "utf8")
) as { operations: Array<{ path: string }> };
const summary = JSON.parse(
  await readFile("examples/heavy-spec-feedback-revision/generated/revision-summary.json", "utf8")
) as JsonRecord;
const verdict = JSON.parse(
  await readFile("examples/heavy-spec-feedback-revision/generated/revision-verdict.json", "utf8")
) as JsonRecord;

function records(value: unknown): JsonRecord[] {
  return value as JsonRecord[];
}

describe("heavy spec role-workspace revision candidate", () => {
  it("is self-contained and passes the structural profile", () => {
    expect(createHeavyProductionSpecValidator(candidate)(candidate)).toEqual([]);
    expect(verdict).toMatchObject({ status: "passed", findings: [] });
    expect(summary).toMatchObject({
      status: "candidate",
      contentDigest: digestWorkflow(candidate),
      counts: { screensBefore: 102, screensAfter: 110 }
    });
  });

  it("contains complete design, navigation and unique heavy entities without a root fixture", () => {
    expect(candidate.designTokens).toBeDefined();
    expect(candidate.extendedDesign).toBeDefined();
    expect(records(candidate.screens)).toHaveLength(110);
    expect(records(candidate.components)).toHaveLength(154);
    expect(records(candidate.actors)).toHaveLength(26);
    expect(new Set(records(candidate.screens).map((screen) => screen.id)).size).toBe(110);
    expect((candidate.navModel as JsonRecord).shells).toBeDefined();
    expect((candidate.navModel as JsonRecord).entryPoints).toBeDefined();
    expect(records((candidate.stateModel as JsonRecord).slices).length).toBeGreaterThan(0);
  });

  it("defines eight role workspaces and the requested 15-screen PoC flow", () => {
    const navModel = candidate.navModel as JsonRecord;
    const workAreas = records(navModel.workAreas);
    const storyboard = records(candidate.demoStoryboard).find(
      (item) => item.id === "voucher-role-handoff-poc"
    )!;
    expect(workAreas).toHaveLength(8);
    expect(workAreas.map((area) => area.label)).toEqual([
      "정책 업무",
      "사업·명부 업무",
      "결재 업무",
      "지급 실행 업무",
      "발행 업무",
      "정산 업무",
      "감사 업무",
      "계정·권한 관리"
    ]);
    const allScreenIds = new Set(records(candidate.screens).map((screen) => screen.id));
    for (const area of workAreas) expect(allScreenIds.has(area.startScreenId)).toBe(true);
    expect(storyboard.priorityScreens).toHaveLength(15);
    const screenById = new Map(records(candidate.screens).map((screen) => [screen.id, screen]));
    for (const id of storyboard.priorityScreens as string[]) {
      const target = screenById.get(id)!;
      expect(target).toBeDefined();
      expect(records(target.states).map((state) => state.state)).toEqual([
        "default",
        "loading",
        "empty",
        "error",
        "unauthorized",
        "read-only",
        "success"
      ]);
    }
  });

  it("keeps approval, payout, signature, and execution as distinct actions", () => {
    const slices = records((candidate.stateModel as JsonRecord).slices);
    const issuance = slices.find((slice) => slice.name === "issuanceApprovalSeparation")!;
    const payout = slices.find((slice) => slice.name === "payoutWork")!;
    expect(records(issuance.actions).map((action) => action.name)).toEqual([
      "approvePlan",
      "signApprovedPlan",
      "executeSignedPlan"
    ]);
    expect(records(payout.actions).map((action) => action.name)).toEqual([
      "startPayout",
      "retryFailedOnly"
    ]);
    const screenIds = new Set(records(candidate.screens).map((screen) => screen.id));
    for (const id of [
      "admin-policy-approval-detail",
      "admin-roster-approval",
      "admin-payout-execution-detail",
      "admin-issuance-plan",
      "admin-issuance-final-signature",
      "admin-issuance-execute"
    ]) {
      expect(screenIds.has(id)).toBe(true);
    }
  });

  it("uses unique typed patch paths and does not promote the candidate", () => {
    const paths = proposal.operations.map((operation) => operation.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(summary.status).toBe("candidate");
    expect(candidate.meta).toMatchObject({
      workAreaRevision: { status: "candidate" },
      revision: {
        schemaVersion: "aawp/embedded-spec-revision/v1",
        status: "candidate",
        generatedBy: "spec-feedback-to-spec",
        parentDigest: summary.parentDigest,
        contractDigest: summary.contractDigest,
        executionInput: "this_document",
        auditSidecarsRequiredAtRuntime: false
      }
    });
    expect((candidate.meta as JsonRecord).revision).toMatchObject({
      feedbackIds: expect.arrayContaining(["role-workspace-001", "poc-flow-001"])
    });
    expect(candidate).not.toHaveProperty("approval");
    expect(candidate).not.toHaveProperty("artifactId");
  });
});
