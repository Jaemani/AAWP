import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  materializeSpecRevisionCandidate,
  parseSpecPatchProposal,
  type SpecFeedbackContract
} from "../index.js";
import {
  ensureArtifactDirectory,
  isRecord,
  readJson,
  requiredRecord,
  resolvePinnedProjectFile
} from "./common.js";

const directory = await ensureArtifactDirectory();
const runtimeContract = await readJson(resolve(directory, "contract.json"));
if (!isRecord(runtimeContract)) throw new Error("runtime contract must be an object");
const sourceRef = requiredRecord(runtimeContract, "source");
const revisionContract = requiredRecord(
  runtimeContract,
  "revisionContract"
) as unknown as SpecFeedbackContract;
const sourcePath = await resolvePinnedProjectFile(sourceRef.path);
const sourceDocument = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
const proposal = parseSpecPatchProposal(await readJson(resolve(directory, "patch-proposal.json")));
const candidate = materializeSpecRevisionCandidate({
  sourceDocument,
  contract: revisionContract,
  proposal
});
const document = candidate.document;
if (!isRecord(document)) {
  throw new Error("candidate must be an object");
}
const meta = document.meta;
if (!isRecord(meta) || !isRecord(meta.revision)) {
  throw new Error("candidate must contain meta.revision");
}
const revision = meta.revision;
revision.parentArtifactId = candidate.parentArtifactId;
revision.parentDigest = candidate.parentDigest;
revision.contractDigest = candidate.contractDigest;
revision.feedbackArtifactDigest = requiredRecord(runtimeContract, "feedback").byteSha256;
revision.compilerVersion = runtimeContract.compilerVersion;
revision.executionInput = "this_document";
revision.promotionStatus = "candidate";

const finalized = materializeSpecRevisionCandidate({
  sourceDocument,
  contract: revisionContract,
  proposal: {
    ...proposal,
    operations: proposal.operations.map((operation) => {
      if (operation.path !== "/meta/revision" || !isRecord(operation.value)) return operation;
      return { ...operation, value: revision };
    })
  }
});
await Promise.all([
  writeFile(
    resolve(directory, "child-spec.candidate.json"),
    `${JSON.stringify(finalized.document, null, 2)}\n`,
    { mode: 0o600 }
  ),
  writeFile(
    resolve(directory, "candidate-envelope.json"),
    `${JSON.stringify(finalized, null, 2)}\n`,
    {
      mode: 0o600
    }
  )
]);
process.stdout.write(
  `${JSON.stringify({ candidateId: finalized.candidateId, contentDigest: finalized.contentDigest })}\n`
);
