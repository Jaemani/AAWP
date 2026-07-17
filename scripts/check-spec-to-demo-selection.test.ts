import { describe, expect, it } from "vitest";
// @ts-expect-error -- the selection checker is an ESM JavaScript script.
import {
  compileDemoExecutionContract,
  selectionFailureMessage,
  validateDemoSelectionContract
} from "./check-spec-to-demo-selection.mjs";

const contract = {
  schemaVersion: "aawp/demo-selection-contract/v2",
  status: "scope-expansion-required",
  entryScreenId: "policy-detail",
  entrySource: "spec",
  requestedScreens: ["policy-detail"],
  deprecatedScreenIds: [],
  conflicts: [],
  requiredScreenIds: ["approval-detail", "policy-detail"],
  missingRequiredScreens: ["approval-detail"],
  unknownScreenTargets: [],
  outOfScopeNavigationTargets: ["settlement-list"],
  flowIds: ["policy-approval"],
  commandIds: ["approve-policy"],
  queryIds: ["policy-detail"],
  evidenceCheckIds: ["check-policy-approval"],
  reason: "S1 needs approval detail"
};

describe("spec-to-demo selection preflight", () => {
  it("accepts a consistent scope-expansion contract and names missing screens", () => {
    expect(validateDemoSelectionContract(contract, ["policy-detail"])).toBe(contract);
    expect(selectionFailureMessage(contract)).toContain("approval-detail");
  });

  it("rejects a false ready status", () => {
    expect(() =>
      validateDemoSelectionContract({ ...contract, status: "ready" }, ["policy-detail"])
    ).toThrow(/status is inconsistent/);
  });

  it("names canonical projection conflicts before model execution", () => {
    const conflicted = {
      ...contract,
      status: "selection-conflict",
      missingRequiredScreens: [],
      conflicts: [
        {
          code: "DEPRECATED_SCREEN_REQUESTED",
          message: "admin-work-area-entry is deprecated"
        }
      ]
    };

    expect(validateDemoSelectionContract(conflicted, ["policy-detail"])).toBe(conflicted);
    expect(selectionFailureMessage(conflicted)).toContain("DEPRECATED_SCREEN_REQUESTED");
  });

  it("compiles a self-contained builder contract without heavy actor notes", () => {
    const ready = {
      ...contract,
      status: "ready",
      requestedScreens: ["policy-detail", "approval-detail"],
      requiredScreenIds: ["approval-detail", "policy-detail"],
      missingRequiredScreens: [],
      flowIds: ["policy-approval"],
      commandIds: ["approve-policy"],
      queryIds: ["policy-detail"],
      evidenceCheckIds: ["check-policy-approval"],
      activeDemoJourneyId: "journey-1"
    };
    const execution = compileDemoExecutionContract({
      runId: "run_test",
      sourceSpec: { path: "runs/requests/test/source-spec.json", byteSha256: "abc" },
      selectionContract: ready,
      source: {
        meta: { scenario: "정책 승인" },
        scope: {
          activeDemoJourneyId: "journey-1",
          navigationPrinciples: [{ id: "shared", statement: "같은 화면을 공유한다" }]
        },
        actors: [
          {
            id: "operator",
            role: "작성자",
            notes: "builder에 전달하면 안 되는 장문의 원본 설명",
            canOperate: ["policy-detail", "outside"]
          }
        ],
        components: [{ name: "PolicyPanel", purpose: "정책", props: ["status"] }],
        screens: [
          {
            id: "policy-detail",
            title: "정책 상세",
            actors: ["operator"],
            components: ["PolicyPanel"],
            copy: [{ key: "title", text: "정책 상세" }],
            feedbackIds: ["FB-1"]
          },
          { id: "approval-detail", actors: [], components: [] }
        ],
        flows: [{ id: "policy-approval", screens: ["policy-detail", "approval-detail"] }],
        stateMachines: [{ id: "policy", transitions: [] }],
        apiContracts: { commandContracts: [{ id: "approve-policy" }] },
        dataBindings: [{ screenId: "policy-detail", commandRefs: ["approve-policy"] }],
        authority: { capabilities: [{ id: "approve", commands: ["approve-policy"] }] },
        acceptance: {
          status: "assumed",
          scenarios: [
            {
              id: "scenario-1",
              evidenceChecks: [
                { id: "check-policy-approval", screenId: "policy-detail" },
                { id: "outside-check", screenId: "outside" }
              ]
            }
          ]
        },
        demoStoryboard: [
          { journeyId: "journey-1", screenId: "policy-detail", feedbackIds: ["FB-1"] }
        ]
      }
    });

    expect(execution.schemaVersion).toBe("aawp/demo-execution-contract/v1");
    expect(execution.actors[0]).not.toHaveProperty("notes");
    expect(execution.actors[0].canOperate).toEqual(["policy-detail"]);
    expect(execution.screens[0]).not.toHaveProperty("feedbackIds");
    expect(execution.acceptance.scenarios[0].evidenceChecks).toHaveLength(1);
    expect(execution.demoStoryboard[0]).not.toHaveProperty("feedbackIds");
  });
});
