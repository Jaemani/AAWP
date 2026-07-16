import { describe, expect, it } from "vitest";
import { compilePreviewContracts, routePreviewBlockers } from "./index.js";

const source = {
  artifactPath: "runs/revisions/spec/child-spec.candidate.json",
  byteSha256: "a".repeat(64)
};

const document = {
  domainModel: {
    entities: [
      {
        id: "ent-policy-version",
        name: "정책 버전",
        responsibility: "승인 뒤 불변인 정책 변경 단위",
        relationships: ["belongs to ent-policy"],
        status: "assumed",
        feedbackIds: ["FB-DATA-001"]
      }
    ]
  },
  apiContracts: {
    queryContracts: [
      {
        id: "qry-policy-detail",
        resource: "ent-policy-version",
        returns: ["id", "version", "status"],
        status: "assumed"
      }
    ],
    commandContracts: [
      {
        id: "cmd-submit-policy",
        authorityCapability: "cap-policy-submit",
        transitionRef: "policyVersion:draft->in_review",
        requires: ["resourceVersion", "idempotencyKey"],
        mutates: ["ent-policy-version"],
        status: "assumed"
      }
    ],
    unresolvedContracts: [{ id: "api-error-codes", status: "unresolved" }]
  },
  authority: {
    capabilities: [
      { id: "cap-policy-view", queries: ["qry-policy-detail"] },
      { id: "cap-policy-submit", commands: ["cmd-submit-policy"] }
    ]
  },
  dataBindings: [
    {
      screenId: "admin-policy-detail",
      queryRefs: ["qry-policy-detail"],
      commandRefs: ["cmd-submit-policy"],
      status: "candidate",
      feedbackIds: ["FB-SCREEN-001"]
    }
  ]
};

describe("preview contract compiler", () => {
  it("preserves logical and unresolved decisions instead of inventing physical DB or transport", () => {
    const result = compilePreviewContracts({ document, source });
    expect(result.status).toBe("ready");
    expect(result.dataContract.entities[0]).toMatchObject({
      id: "ent-policy-version",
      status: "assumed",
      physicalStorage: { status: "unresolved" }
    });
    expect(result.apiContract.commands[0]).toMatchObject({
      capabilityId: "cap-policy-submit",
      optimisticConcurrency: { required: true, source: "resourceVersion" },
      idempotency: { required: true, source: "idempotencyKey" }
    });
    expect(result.dataContract.queries[0]).toMatchObject({
      capabilityId: "cap-policy-view",
      reads: ["ent-policy-version"],
      responseFields: ["id", "version", "status"]
    });
    expect(result.apiContract.transport.status).toBe("unresolved");
    expect(result.apiContract.unresolvedContracts).toEqual([
      { id: "api-error-codes", status: "unresolved" }
    ]);
  });

  it("routes S2 blockers to the owning contract without hiding human decisions", () => {
    const blockers = [
      {
        id: "finding-capability",
        code: "COMMAND_CAPABILITY_UNRESOLVED",
        message: "command has no server capability",
        pointers: ["/apiContracts/commands/0"]
      },
      {
        id: "finding-pii",
        code: "OPEN_DECISION",
        message: "PII attachment storage is unresolved",
        owner: "security/data",
        question: "Which encrypted object store owns source attachments?"
      }
    ];
    const routing = routePreviewBlockers(blockers);
    expect(routing.status).toBe("blocked");
    expect(routing.byOwner.api).toContain("finding-capability");
    expect(routing.byOwner.authority).toContain("finding-capability");
    expect(routing.byOwner.data).toContain("finding-pii");
    expect(routing.byOwner["product-decision"]).toContain("finding-pii");

    const result = compilePreviewContracts({ document, source, blockers });
    expect(result.status).toBe("blocked");
    expect(result.dataContract.blockerIds).toContain("finding-pii");
    expect(result.apiContract.blockerIds).toContain("finding-capability");
  });
});
