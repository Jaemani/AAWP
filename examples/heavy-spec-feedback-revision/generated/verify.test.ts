import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digestWorkflow } from "@awf/ir";
import { createHeavyProductionSpecValidator } from "@awf/spec-feedback-to-spec";

type JsonRecord = Record<string, unknown>;

const sourceBytes = await readFile("refined-production-spec.json");
const source = JSON.parse(sourceBytes.toString("utf8")) as JsonRecord;
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

const mutableScreenIds = new Set([
  "admin-auth",
  "admin-policy-list",
  "admin-voucher-policy-setup",
  "admin-roster-builder",
  "admin-roster-approval",
  "admin-approval-inbox",
  "admin-issuance-plans",
  "admin-issuance-plan",
  "admin-issuance-execute",
  "admin-role-grant"
]);

function records(value: unknown): JsonRecord[] {
  return value as JsonRecord[];
}

describe("heavy spec role-workspace revision candidate", () => {
  it("keeps the source immutable and passes the structural profile", () => {
    expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(
      "b4b50cd9c1d2321c8936126c00c3ff242bb88ba5445c26abfffc03187993df33"
    );
    expect(createHeavyProductionSpecValidator(source)(candidate)).toEqual([]);
    expect(verdict).toMatchObject({ status: "passed", findings: [] });
    expect(summary).toMatchObject({
      status: "candidate",
      contentDigest: digestWorkflow(candidate),
      counts: { screensBefore: 102, screensAfter: 110 }
    });
  });

  it("preserves design contracts and every unrelated baseline screen byte-for-structure", () => {
    expect(candidate.designTokens).toEqual(source.designTokens);
    expect(candidate.extendedDesign).toEqual(source.extendedDesign);
    const candidateScreenById = new Map(
      records(candidate.screens).map((screen) => [screen.id, screen])
    );
    for (const baseline of records(source.screens)) {
      expect(candidateScreenById.has(baseline.id)).toBe(true);
      if (!mutableScreenIds.has(String(baseline.id))) {
        expect(candidateScreenById.get(baseline.id)).toEqual(baseline);
      }
    }
    expect(records(candidate.components).slice(0, records(source.components).length)).toEqual(
      source.components
    );
    expect(records(candidate.mockData).slice(0, records(source.mockData).length)).toEqual(
      source.mockData
    );
    expect((candidate.navModel as JsonRecord).shells).toEqual(
      (source.navModel as JsonRecord).shells
    );
    expect((candidate.navModel as JsonRecord).entryPoints).toEqual(
      (source.navModel as JsonRecord).entryPoints
    );
    expect(
      records((candidate.stateModel as JsonRecord).slices).slice(
        0,
        records((source.stateModel as JsonRecord).slices).length
      )
    ).toEqual((source.stateModel as JsonRecord).slices);
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
      workAreaRevision: { status: "candidate" }
    });
    expect(candidate).not.toHaveProperty("approval");
    expect(candidate).not.toHaveProperty("artifactId");
  });
});
