import { describe, expect, it } from "vitest";
// @ts-expect-error -- the selection checker is an ESM JavaScript script.
import {
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
});
