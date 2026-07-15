import { digestWorkflow } from "@awf/ir";
import { describe, expect, it } from "vitest";
import {
  approveSpecRevision,
  compileSpecFeedbackContract,
  materializeSpecRevisionCandidate,
  SpecRevisionError,
  verifySpecRevision,
  type SpecFeedbackIntent,
  type SpecPatchProposal
} from "./index.js";

const source = {
  meta: { title: "Wallet spec", version: 1 },
  screens: [{ id: "policy-list", title: "정책 목록", copy: { empty: "정책이 없습니다" } }]
};

function intent(): SpecFeedbackIntent {
  return {
    schemaVersion: "aawp/spec-feedback-intent/v1",
    sourceArtifactId: "spec-wallet-v1",
    sourceDigest: digestWorkflow(source),
    requestText: "정책 목록 빈 상태 문구를 바꿔줘",
    feedback: [
      {
        id: "feedback-1",
        text: "빈 상태에서 정책 작성 방법을 안내해줘",
        targetPointer: "/screens/0/copy/empty"
      }
    ],
    authority: { allowedPathPrefixes: ["/screens/0"], allowRemove: false },
    profile: { id: "wallet-spec", requiredPointers: ["/meta/title", "/screens"] }
  };
}

function proposal(): SpecPatchProposal {
  return {
    schemaVersion: "aawp/spec-patch-proposal/v1",
    operations: [
      {
        operation: "replace",
        path: "/screens/0/copy/empty",
        value: "등록된 정책이 없습니다. 새 정책을 작성해 주세요.",
        feedbackIds: ["feedback-1"],
        reason: "빈 상태에 다음 행동을 추가한다."
      }
    ]
  };
}

describe("spec-feedback-to-spec revision pipeline", () => {
  it("creates an immutable candidate, verifies it, and promotes only the approved artifact", () => {
    const original = structuredClone(source);
    const contract = compileSpecFeedbackContract(intent(), source);
    const candidate = materializeSpecRevisionCandidate({
      sourceDocument: source,
      contract,
      proposal: proposal()
    });
    expect(source).toEqual(original);
    expect(candidate.parentDigest).toBe(digestWorkflow(source));
    expect(candidate.changedPointers).toEqual(["/screens/0/copy/empty"]);
    expect(candidate.document).toMatchObject({
      screens: [{ copy: { empty: "등록된 정책이 없습니다. 새 정책을 작성해 주세요." } }]
    });
    const verdict = verifySpecRevision({ sourceDocument: source, candidate, contract });
    expect(verdict.status).toBe("passed");
    const approved = approveSpecRevision({
      candidate,
      verdict,
      approval: {
        approvalId: "approval-1",
        actorId: "product-owner",
        decision: "approved",
        decidedAt: "2026-07-15T00:00:00.000Z"
      }
    });
    expect(approved.status).toBe("approved");
    expect(approved.artifactId).toBe(`spec_${candidate.contentDigest}`);
  });

  it("rejects source drift, unauthorized paths, deletion, and unknown feedback", () => {
    expect(() => compileSpecFeedbackContract(intent(), { ...source, changed: true })).toThrowError(
      expect.objectContaining({ code: "SOURCE_DIGEST_MISMATCH" })
    );
    const contract = compileSpecFeedbackContract(intent(), source);
    const outside = proposal();
    outside.operations[0]!.path = "/meta/title";
    expect(() =>
      materializeSpecRevisionCandidate({ sourceDocument: source, contract, proposal: outside })
    ).toThrowError(expect.objectContaining({ code: "PATH_OUTSIDE_AUTHORITY" }));

    const removal = proposal();
    removal.operations[0] = {
      operation: "remove",
      path: "/screens/0/copy/empty",
      feedbackIds: ["feedback-1"],
      reason: "remove"
    };
    expect(() =>
      materializeSpecRevisionCandidate({ sourceDocument: source, contract, proposal: removal })
    ).toThrowError(expect.objectContaining({ code: "REMOVE_NOT_ALLOWED" }));

    const unknown = proposal();
    unknown.operations[0]!.feedbackIds = ["feedback-unknown"];
    expect(() =>
      materializeSpecRevisionCandidate({ sourceDocument: source, contract, proposal: unknown })
    ).toThrowError(expect.objectContaining({ code: "UNKNOWN_FEEDBACK_ID" }));
  });

  it("keeps domain standards pluggable through required pointers and profile findings", () => {
    const contract = compileSpecFeedbackContract(intent(), source);
    const candidate = materializeSpecRevisionCandidate({
      sourceDocument: source,
      contract,
      proposal: proposal()
    });
    const verdict = verifySpecRevision({
      sourceDocument: source,
      candidate,
      contract,
      validator: () => [{ code: "DOMAIN_RULE", message: "domain-specific failure" }]
    });
    expect(verdict.status).toBe("failed");
    expect(() =>
      approveSpecRevision({
        candidate,
        verdict,
        approval: {
          approvalId: "approval-2",
          actorId: "owner",
          decision: "approved",
          decidedAt: "2026-07-15T00:00:00.000Z"
        }
      })
    ).toThrow(SpecRevisionError);
  });

  it("replays the patch independently and rejects a candidate with undeclared changes", () => {
    const contract = compileSpecFeedbackContract(intent(), source);
    const candidate = materializeSpecRevisionCandidate({
      sourceDocument: source,
      contract,
      proposal: proposal()
    });
    const tampered = structuredClone(candidate);
    const tamperedDocument = structuredClone(tampered.document) as typeof source;
    tamperedDocument.meta.title = "Undeclared title";
    tampered.document = tamperedDocument;
    tampered.contentDigest = digestWorkflow(tampered.document);
    const verdict = verifySpecRevision({ sourceDocument: source, candidate: tampered, contract });
    expect(verdict.status).toBe("failed");
    expect(verdict.findings.map((finding) => finding.code)).toContain(
      "CANDIDATE_MATERIALIZATION_MISMATCH"
    );
  });

  it("supports escaped JSON Pointer fields and array append without unsafe segments", () => {
    const escapedSource = { meta: { "a/b": "old" }, screens: [] };
    const escapedIntent: SpecFeedbackIntent = {
      ...intent(),
      sourceDigest: digestWorkflow(escapedSource),
      feedback: [{ id: "feedback-1", text: "update", targetPointer: "/meta/a~1b" }],
      authority: { allowedPathPrefixes: ["/meta", "/screens"], allowRemove: false }
    };
    const contract = compileSpecFeedbackContract(escapedIntent, escapedSource);
    const candidate = materializeSpecRevisionCandidate({
      sourceDocument: escapedSource,
      contract,
      proposal: {
        schemaVersion: "aawp/spec-patch-proposal/v1",
        operations: [
          {
            operation: "replace",
            path: "/meta/a~1b",
            value: "new",
            feedbackIds: ["feedback-1"],
            reason: "escaped field"
          },
          {
            operation: "add",
            path: "/screens/-",
            value: { id: "new-screen" },
            feedbackIds: ["feedback-1"],
            reason: "append screen"
          }
        ]
      }
    });
    expect(candidate.document).toEqual({ meta: { "a/b": "new" }, screens: [{ id: "new-screen" }] });
    const unsafe = structuredClone(escapedIntent);
    unsafe.feedback[0]!.targetPointer = "/meta/__proto__/polluted";
    expect(() => compileSpecFeedbackContract(unsafe, escapedSource)).toThrow();
  });
});
