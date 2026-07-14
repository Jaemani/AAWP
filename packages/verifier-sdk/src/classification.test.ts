import { describe, expect, it } from "vitest";
import { authorizeRepair, classifyFailure, reconcileFindings } from "./classification.js";
import { verifierOutput } from "./test-fixture.js";

describe("failure classification and repair authority", () => {
  it.each([
    ["behavior_mismatch", "product_defect"],
    ["acceptance_ambiguity", "test_contract_defect"],
    ["verifier_malfunction", "harness_defect"],
    ["resource_exhausted", "infra_capacity"],
    ["forbidden_effect", "policy_violation"],
    ["insufficient_evidence", "inconclusive"]
  ] as const)("classifies %s as %s", (signal, expected) => {
    expect(classifyFailure(signal)).toBe(expected);
  });

  it("authorizes only the owning lane and allowed product write set", () => {
    const finding = verifierOutput().findings[0]!;
    expect(
      authorizeRepair(finding, { actorRole: "builder", requestedWrites: ["src/login.ts"] })
    ).toMatchObject({ authorized: true, lane: "product" });
    expect(
      authorizeRepair(finding, { actorRole: "builder", requestedWrites: ["tests/hidden.ts"] })
    ).toMatchObject({ authorized: false, reasonCode: "WRITE_OUTSIDE_REPAIR_SCOPE" });
    expect(
      authorizeRepair(finding, { actorRole: "verifier", requestedWrites: ["src/login.ts"] })
    ).toMatchObject({ authorized: false, reasonCode: "ACTOR_ROLE_NOT_AUTHORIZED" });
  });

  it("does not grant automatic writes for policy or inconclusive findings", () => {
    const base = verifierOutput().findings[0]!;
    for (const findingClass of ["policy_violation", "inconclusive"] as const) {
      expect(
        authorizeRepair(
          { ...base, class: findingClass },
          { actorRole: "policy_owner", requestedWrites: [] }
        ).authorized
      ).toBe(false);
    }
  });

  it("uses stable finding ids to distinguish resolution from disappearance", () => {
    const finding = verifierOutput().findings[0]!;
    expect(reconcileFindings([finding], [{ ...finding, status: "resolved" }])).toMatchObject({
      resolvedIds: [finding.id],
      missingOpenIds: []
    });
    expect(reconcileFindings([finding], [])).toMatchObject({
      resolvedIds: [],
      missingOpenIds: [finding.id]
    });
  });
});
