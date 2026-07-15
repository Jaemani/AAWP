import { canonicalize, digestWorkflow, sha256Hex } from "@awf/ir";
import {
  indexForPointer,
  parseJsonPointer,
  readJsonPointer,
  resolveJsonPointerParent
} from "./pointer.js";
import {
  parseSpecFeedbackIntent,
  parseSpecPatchProposal,
  type SpecFeedbackIntent,
  type SpecPatchOperation,
  type SpecPatchProposal
} from "./schema.js";

export interface SpecFeedbackContract {
  contractType: "spec-feedback";
  sourceArtifactId: string;
  sourceDigest: string;
  requestText: string;
  feedbackIds: string[];
  allowedPathPrefixes: string[];
  allowRemove: boolean;
  profileId: string;
  requiredPointers: string[];
  digest: string;
}

export interface SpecRevisionCandidate {
  schemaVersion: "aawp/spec-revision-candidate/v1";
  candidateId: string;
  status: "candidate";
  parentArtifactId: string;
  parentDigest: string;
  contractDigest: string;
  operations: SpecPatchOperation[];
  changedPointers: string[];
  document: unknown;
  contentDigest: string;
}

export interface SpecRevisionFinding {
  code: string;
  message: string;
  pointer?: string;
}

export interface SpecRevisionVerdict {
  schemaVersion: "aawp/spec-revision-verdict/v1";
  candidateId: string;
  status: "passed" | "failed";
  findings: SpecRevisionFinding[];
  digest: string;
}

export interface SpecRevisionApproval {
  approvalId: string;
  actorId: string;
  decision: "approved" | "rejected";
  decidedAt: string;
}

export interface ApprovedSpecRevision extends Omit<SpecRevisionCandidate, "status"> {
  status: "approved";
  artifactId: string;
  approval: SpecRevisionApproval;
}

export type SpecProfileValidator = (document: unknown) => SpecRevisionFinding[];

export class SpecRevisionError extends Error {
  constructor(
    readonly code:
      | "SOURCE_DIGEST_MISMATCH"
      | "DUPLICATE_FEEDBACK_ID"
      | "UNKNOWN_FEEDBACK_ID"
      | "DUPLICATE_PATCH_PATH"
      | "PATH_OUTSIDE_AUTHORITY"
      | "REMOVE_NOT_ALLOWED"
      | "MISSING_PATCH_VALUE"
      | "UNEXPECTED_PATCH_VALUE"
      | "NO_OP_REVISION"
      | "REVISION_FAILED_VERIFICATION"
      | "REVISION_NOT_APPROVED",
    message: string
  ) {
    super(message);
    this.name = "SpecRevisionError";
  }
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalize(value)) as T;
}

function withinPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function compileSpecFeedbackContract(
  rawIntent: SpecFeedbackIntent,
  sourceDocument: unknown
): SpecFeedbackContract {
  const intent = parseSpecFeedbackIntent(rawIntent);
  const actualDigest = digestWorkflow(sourceDocument);
  if (actualDigest !== intent.sourceDigest) {
    throw new SpecRevisionError(
      "SOURCE_DIGEST_MISMATCH",
      `source digest ${actualDigest} does not match pinned ${intent.sourceDigest}`
    );
  }
  for (const prefix of intent.authority.allowedPathPrefixes) parseJsonPointer(prefix);
  const feedbackIds = new Set<string>();
  for (const feedback of intent.feedback) {
    if (feedbackIds.has(feedback.id)) {
      throw new SpecRevisionError("DUPLICATE_FEEDBACK_ID", `duplicate feedback id ${feedback.id}`);
    }
    feedbackIds.add(feedback.id);
    if (feedback.targetPointer !== undefined) {
      parseJsonPointer(feedback.targetPointer);
      if (
        !intent.authority.allowedPathPrefixes.some((prefix) =>
          withinPrefix(feedback.targetPointer!, prefix)
        )
      ) {
        throw new SpecRevisionError(
          "PATH_OUTSIDE_AUTHORITY",
          `feedback target ${feedback.targetPointer} is outside the feedback contract`
        );
      }
    }
  }
  const content = {
    contractType: "spec-feedback" as const,
    sourceArtifactId: intent.sourceArtifactId,
    sourceDigest: intent.sourceDigest,
    requestText: intent.requestText,
    feedbackIds: [...feedbackIds],
    allowedPathPrefixes: [...intent.authority.allowedPathPrefixes],
    allowRemove: intent.authority.allowRemove,
    profileId: intent.profile.id,
    requiredPointers: [...(intent.profile.requiredPointers ?? [])]
  };
  return { ...content, digest: digestWorkflow(content) };
}

function validateProposal(proposal: SpecPatchProposal, contract: SpecFeedbackContract): void {
  const paths = new Set<string>();
  const feedbackIds = new Set(contract.feedbackIds);
  for (const operation of proposal.operations) {
    if (paths.has(operation.path)) {
      throw new SpecRevisionError(
        "DUPLICATE_PATCH_PATH",
        `multiple operations target ${operation.path}`
      );
    }
    paths.add(operation.path);
    if (!contract.allowedPathPrefixes.some((prefix) => withinPrefix(operation.path, prefix))) {
      throw new SpecRevisionError(
        "PATH_OUTSIDE_AUTHORITY",
        `operation path ${operation.path} is outside the feedback contract`
      );
    }
    for (const feedbackId of operation.feedbackIds) {
      if (!feedbackIds.has(feedbackId)) {
        throw new SpecRevisionError(
          "UNKNOWN_FEEDBACK_ID",
          `operation references unknown feedback ${feedbackId}`
        );
      }
    }
    if (operation.operation === "remove") {
      if (!contract.allowRemove) {
        throw new SpecRevisionError(
          "REMOVE_NOT_ALLOWED",
          `remove is not allowed at ${operation.path}`
        );
      }
      if (operation.value !== undefined) {
        throw new SpecRevisionError(
          "UNEXPECTED_PATCH_VALUE",
          `remove operation must not include a value at ${operation.path}`
        );
      }
    } else if (operation.value === undefined) {
      throw new SpecRevisionError(
        "MISSING_PATCH_VALUE",
        `${operation.operation} requires a value at ${operation.path}`
      );
    }
  }
}

function applyOperation(document: unknown, operation: SpecPatchOperation): void {
  const { parent, key } = resolveJsonPointerParent(document, operation.path);
  if (Array.isArray(parent)) {
    if (operation.operation === "add") {
      parent.splice(indexForPointer(parent, key, true), 0, clone(operation.value));
      return;
    }
    const index = indexForPointer(parent, key, false);
    if (operation.operation === "replace") parent[index] = clone(operation.value);
    else parent.splice(index, 1);
    return;
  }
  if (typeof parent !== "object" || parent === null) {
    throw new TypeError(`patch parent is not an object at ${operation.path}`);
  }
  const record = parent as Record<string, unknown>;
  if (operation.operation !== "add" && !(key in record)) {
    readJsonPointer(document, operation.path);
  }
  if (operation.operation === "remove") delete record[key];
  else record[key] = clone(operation.value);
}

export function materializeSpecRevisionCandidate(input: {
  sourceDocument: unknown;
  contract: SpecFeedbackContract;
  proposal: SpecPatchProposal;
}): SpecRevisionCandidate {
  const proposal = parseSpecPatchProposal(input.proposal);
  validateProposal(proposal, input.contract);
  if (digestWorkflow(input.sourceDocument) !== input.contract.sourceDigest) {
    throw new SpecRevisionError(
      "SOURCE_DIGEST_MISMATCH",
      "source changed after contract compilation"
    );
  }
  const revised = clone(input.sourceDocument);
  for (const operation of proposal.operations) applyOperation(revised, operation);
  const contentDigest = digestWorkflow(revised);
  if (contentDigest === input.contract.sourceDigest) {
    throw new SpecRevisionError("NO_OP_REVISION", "patch proposal does not change the source spec");
  }
  const content = {
    schemaVersion: "aawp/spec-revision-candidate/v1" as const,
    status: "candidate" as const,
    parentArtifactId: input.contract.sourceArtifactId,
    parentDigest: input.contract.sourceDigest,
    contractDigest: input.contract.digest,
    operations: clone(proposal.operations),
    changedPointers: proposal.operations.map((operation) => operation.path),
    document: revised,
    contentDigest
  };
  return {
    ...content,
    candidateId: `specrev_${sha256Hex(canonicalize(content))}`
  };
}

export function verifySpecRevision(input: {
  sourceDocument: unknown;
  candidate: SpecRevisionCandidate;
  contract: SpecFeedbackContract;
  validator?: SpecProfileValidator;
}): SpecRevisionVerdict {
  const findings: SpecRevisionFinding[] = [];
  if (input.candidate.parentDigest !== input.contract.sourceDigest) {
    findings.push({ code: "PARENT_DIGEST_MISMATCH", message: "candidate parent digest changed" });
  }
  if (input.candidate.contractDigest !== input.contract.digest) {
    findings.push({
      code: "CONTRACT_DIGEST_MISMATCH",
      message: "candidate contract digest changed"
    });
  }
  if (digestWorkflow(input.candidate.document) !== input.candidate.contentDigest) {
    findings.push({
      code: "CONTENT_DIGEST_MISMATCH",
      message: "candidate content digest is invalid"
    });
  }
  try {
    const expected = materializeSpecRevisionCandidate({
      sourceDocument: input.sourceDocument,
      contract: input.contract,
      proposal: {
        schemaVersion: "aawp/spec-patch-proposal/v1",
        operations: input.candidate.operations
      }
    });
    if (canonicalize(expected) !== canonicalize(input.candidate)) {
      findings.push({
        code: "CANDIDATE_MATERIALIZATION_MISMATCH",
        message: "candidate does not match deterministic patch materialization"
      });
    }
  } catch (error) {
    findings.push({
      code: "CANDIDATE_MATERIALIZATION_FAILED",
      message: error instanceof Error ? error.message : String(error)
    });
  }
  for (const pointer of input.contract.requiredPointers) {
    try {
      readJsonPointer(input.candidate.document, pointer);
    } catch {
      findings.push({
        code: "REQUIRED_POINTER_MISSING",
        message: `required pointer ${pointer} is missing`,
        pointer
      });
    }
  }
  findings.push(...(input.validator?.(input.candidate.document) ?? []));
  const content = {
    schemaVersion: "aawp/spec-revision-verdict/v1" as const,
    candidateId: input.candidate.candidateId,
    status: findings.length === 0 ? ("passed" as const) : ("failed" as const),
    findings
  };
  return { ...content, digest: digestWorkflow(content) };
}

export function approveSpecRevision(input: {
  candidate: SpecRevisionCandidate;
  verdict: SpecRevisionVerdict;
  approval: SpecRevisionApproval;
}): ApprovedSpecRevision {
  if (
    input.verdict.candidateId !== input.candidate.candidateId ||
    input.verdict.status !== "passed"
  ) {
    throw new SpecRevisionError(
      "REVISION_FAILED_VERIFICATION",
      "only the independently verified candidate can be approved"
    );
  }
  if (input.approval.decision !== "approved") {
    throw new SpecRevisionError("REVISION_NOT_APPROVED", "revision approval was rejected");
  }
  return Object.freeze({
    ...input.candidate,
    status: "approved",
    artifactId: `spec_${input.candidate.contentDigest}`,
    approval: clone(input.approval)
  });
}
