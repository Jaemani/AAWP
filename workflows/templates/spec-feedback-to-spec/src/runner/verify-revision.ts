import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { digestWorkflow } from "@awf/ir";
import { compilePreviewContracts } from "@awf/preview-contracts";
import {
  compileSemanticSpecProfile,
  createHeavyProductionSpecValidator,
  verifySpecRevision,
  type MaturityStage,
  type SpecFeedbackContract,
  type SpecRevisionCandidate
} from "../index.js";
import {
  ensureArtifactDirectory,
  isRecord,
  readJson,
  requiredRecord,
  requiredString,
  resolvePinnedProjectFile,
  sha256
} from "./common.js";

const directory = await ensureArtifactDirectory();
const runtimeContract = await readJson(resolve(directory, "contract.json"));
const candidate = (await readJson(
  resolve(directory, "candidate-envelope.json")
)) as SpecRevisionCandidate;
const candidateBytes = await readFile(resolve(directory, "child-spec.candidate.json"));
const proposal = await readJson(resolve(directory, "patch-proposal.json"));
if (!isRecord(runtimeContract) || !isRecord(proposal))
  throw new Error("verification inputs invalid");
const sourceRef = requiredRecord(runtimeContract, "source");
const feedbackRef = requiredRecord(runtimeContract, "feedback");
const revisionContract = requiredRecord(
  runtimeContract,
  "revisionContract"
) as unknown as SpecFeedbackContract;
const sourcePath = await resolvePinnedProjectFile(sourceRef.path);
const sourceBytes = await readFile(sourcePath);
if (sha256(sourceBytes) !== requiredString(sourceRef, "byteSha256")) {
  throw new Error("source changed before independent verification");
}
const sourceDocument = JSON.parse(sourceBytes.toString("utf8")) as unknown;
const target = requiredString(feedbackRef, "targetMaturity") as MaturityStage;
const semantics = compileSemanticSpecProfile(candidate.document, target);
const previewBlockers = semantics.gapReport.findings
  .filter(
    (finding) => finding.blocker !== "NON_BLOCKING_GAP" && finding.affectedStages.includes("S2")
  )
  .map((finding) => ({
    id: finding.id,
    code: finding.code,
    message: finding.message,
    pointers: finding.pointers,
    objectIds: finding.objectIds,
    sourceRefs: finding.sourceRefs,
    ...(finding.owner === undefined ? {} : { owner: finding.owner }),
    ...(finding.question === undefined ? {} : { question: finding.question })
  }));
const previewContracts = compilePreviewContracts({
  document: candidate.document,
  source: {
    artifactPath: "child-spec.candidate.json",
    byteSha256: sha256(candidateBytes),
    canonicalDigest: candidate.contentDigest
  },
  blockers: previewBlockers
});
const structural = createHeavyProductionSpecValidator(sourceDocument);
const revisionVerdict = verifySpecRevision({
  sourceDocument,
  candidate,
  contract: revisionContract,
  validator: (document) => [...structural(document), ...semantics.revisionFindings]
});
const operations = Array.isArray(proposal.operations) ? proposal.operations.filter(isRecord) : [];
const impactContent = {
  schemaVersion: "aawp/spec-impact-report/v1",
  candidateId: candidate.candidateId,
  changes: operations.map((operation) => ({
    operation: operation.operation,
    pointer: operation.path,
    feedbackIds: operation.feedbackIds,
    reason: operation.reason,
    affectedStableIds: Array.isArray(operation.affectedIds) ? operation.affectedIds : []
  })),
  downstreamInvalidation: ["spec-to-demo", "spec-to-preview", "spec-to-application"]
};
const impactReport = { ...impactContent, digest: digestWorkflow(impactContent) };
const summaryContent = {
  schemaVersion: "aawp/spec-feedback-verification-summary/v1",
  candidateId: candidate.candidateId,
  promotionStatus: "candidate",
  revisionStatus: revisionVerdict.status,
  parentDigest: candidate.parentDigest,
  childDigest: candidate.contentDigest,
  feedbackDigest: requiredString(feedbackRef, "byteSha256"),
  decisionStatusCounts: semantics.decisionStatusCounts,
  maturity: semantics.maturityVerdict.stages,
  gapCounts: semantics.gapReport.counts,
  traceCoverage: semantics.traceabilityReport.coverage,
  previewContractStatus: previewContracts.status,
  dataContractDigest: previewContracts.dataContract.digest,
  apiContractDigest: previewContracts.apiContract.digest,
  operationCount: operations.length,
  unsupportedChecks: [
    "production DB topology and physical schema",
    "production API authorization enforcement",
    "production PII storage verification"
  ]
};
const summary = { ...summaryContent, digest: digestWorkflow(summaryContent) };
await Promise.all([
  writeFile(
    resolve(directory, "revision-verdict.json"),
    `${JSON.stringify(revisionVerdict, null, 2)}\n`
  ),
  writeFile(
    resolve(directory, "gap-report.json"),
    `${JSON.stringify(semantics.gapReport, null, 2)}\n`
  ),
  writeFile(
    resolve(directory, "maturity-verdict.json"),
    `${JSON.stringify(semantics.maturityVerdict, null, 2)}\n`
  ),
  writeFile(
    resolve(directory, "traceability-report.json"),
    `${JSON.stringify(semantics.traceabilityReport, null, 2)}\n`
  ),
  writeFile(resolve(directory, "impact-report.json"), `${JSON.stringify(impactReport, null, 2)}\n`),
  writeFile(
    resolve(directory, "verification-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  ),
  writeFile(
    resolve(directory, "data-contract.json"),
    `${JSON.stringify(previewContracts.dataContract, null, 2)}\n`
  ),
  writeFile(
    resolve(directory, "api-contract.json"),
    `${JSON.stringify(previewContracts.apiContract, null, 2)}\n`
  ),
  writeFile(
    resolve(directory, "preview-blocker-routing.json"),
    `${JSON.stringify(previewContracts.blockerRouting, null, 2)}\n`
  )
]);
process.stdout.write(`${JSON.stringify(summary)}\n`);
if (revisionVerdict.status !== "passed") process.exitCode = 1;
