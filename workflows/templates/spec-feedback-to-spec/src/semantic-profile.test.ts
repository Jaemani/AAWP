import { describe, expect, it } from "vitest";
import { compileSemanticSpecProfile } from "./semantic-profile.js";

function fixture(): Record<string, unknown> {
  return {
    meta: { title: "정책 백오피스" },
    references: [{ id: "feedback", digest: "a".repeat(64) }],
    scope: { included: ["관리자 콘솔 정책"] },
    glossary: [],
    actors: [{ id: "policy-editor" }, { id: "policy-approver" }],
    requirements: [
      {
        id: "REQ-SHARED-POLICY",
        statement: "같은 정책 상세를 공유한다",
        status: "confirmed",
        sourceRefs: ["FB-ARCH-002"]
      }
    ],
    domainModel: { entities: [{ id: "policy-version" }] },
    stateMachines: [
      {
        id: "policy-version-state",
        transitions: [{ id: "submit-policy-version" }, { id: "approve-policy-version" }]
      }
    ],
    apiContracts: {
      queries: [{ id: "get-policy-detail" }],
      commands: [
        {
          id: "submit-policy-version",
          capabilityId: "policy.submit",
          transitionId: "submit-policy-version",
          expectedResourceVersion: true,
          idempotencyRequired: true
        },
        {
          id: "approve-policy-version",
          capabilityId: "policy.approve",
          transitionId: "approve-policy-version",
          expectedResourceVersion: true,
          idempotencyRequired: true
        }
      ]
    },
    screens: [
      {
        id: "admin-policy-detail",
        route: "/admin/policies/:policyId",
        canonical: true,
        resourceType: "policy",
        resourcePurpose: "detail",
        actors: ["policy-editor", "policy-approver"],
        actions: [
          { id: "submit", targetKind: "command", targetId: "submit-policy-version" },
          { id: "approve", targetKind: "command", targetId: "approve-policy-version" }
        ]
      }
    ],
    flows: [{ id: "policy-lifecycle" }],
    dataBindings: [{ id: "policy-detail-binding", queryId: "get-policy-detail" }],
    authority: {
      capabilities: [{ id: "policy.submit" }, { id: "policy.approve" }],
      constraints: [{ id: "no-self-approval" }]
    },
    acceptance: [{ id: "ACC-SHARED-POLICY" }],
    nonFunctional: [
      {
        id: "NFR-AUDIT",
        statement: "결정 이력을 남긴다",
        status: "confirmed",
        sourceRefs: ["FB-AUTH-001"]
      }
    ],
    assumptions: [
      {
        id: "ASM-APPROVAL-CHAIN",
        statement: "Demo 결재 단계",
        status: "assumed",
        reviewOwner: "policy-owner",
        blocks: ["preview"]
      }
    ],
    openQuestions: [
      {
        id: "OPEN-ERROR-CODES",
        status: "unresolved",
        question: "API 오류 코드를 어떻게 정할 것인가?",
        owner: "api-owner",
        blocks: ["preview"]
      }
    ],
    traceability: [
      {
        requirementId: "REQ-SHARED-POLICY",
        sourceRefs: ["FB-ARCH-002"],
        screenIds: ["admin-policy-detail"],
        flowIds: ["policy-lifecycle"],
        acceptanceIds: ["ACC-SHARED-POLICY"]
      }
    ],
    navModel: { items: [{ label: "정책", target: "admin-policy-detail" }] }
  };
}

describe("canonical semantic spec profile", () => {
  it("allows an S1 demo while preserving unresolved S2 decisions as blockers", () => {
    const result = compileSemanticSpecProfile(fixture(), "S2");

    expect(result.maturityVerdict.stages.S1.status).toBe("passed");
    expect(result.maturityVerdict.stages.S2.status).toBe("blocked");
    expect(result.gapReport.counts.DEMO_BLOCKER).toBe(0);
    expect(result.gapReport.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "OPEN_DECISION" })])
    );
    expect(result.decisionStatusCounts).toMatchObject({ confirmed: 2, assumed: 1, unresolved: 1 });
    expect(result.traceabilityReport.coverage).toBe(1);
    expect(result.revisionFindings).toEqual([]);
  });

  it("blocks demos with role-duplicated screens or actions that do not resolve", () => {
    const document = fixture();
    const screens = document.screens as Array<Record<string, unknown>>;
    screens[0]!.actors = ["policy-editor"];
    screens.push({
      ...structuredClone(screens[0]!),
      id: "admin-policy-approver-detail",
      route: "/admin/approver/policies/:policyId",
      actors: ["policy-approver"],
      actions: [{ id: "broken", targetKind: "command", targetId: "missing-command" }]
    });

    const codes = compileSemanticSpecProfile(document, "S1").gapReport.findings.map(
      (finding) => finding.code
    );
    expect(codes).toContain("PROBABLE_ROLE_BASED_DUPLICATE");
    expect(codes).toContain("SCREEN_ACTION_TARGET_UNRESOLVED");
  });
});
