import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { digestWorkflow } from "@awf/ir";
import {
  compileSpecFeedbackContract,
  type FeedbackItem,
  type SpecFeedbackIntent
} from "../index.js";
import {
  ensureArtifactDirectory,
  isRecord,
  readRunInput,
  requiredRecord,
  requiredString,
  resolvePinnedProjectFile,
  sha256
} from "./common.js";

function parseFeedback(source: string): FeedbackItem[] {
  const matches = [
    ...source.matchAll(/^#{2,6}\s+(FB-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\s+—\s+([^\n]+)\n/gmu)
  ];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    const body = source.slice(start, end).trim();
    const sourceLine = body.match(/`source:\s*([^`]+)`/u)?.[1]?.trim();
    return {
      id: String(match[1]),
      text: `${String(match[2]).trim()}\n\n${body}`,
      ...(sourceLine === undefined ? {} : { source: sourceLine })
    };
  });
}

const input = await readRunInput();
const sourceRef = requiredRecord(input, "source");
const feedbackRef = requiredRecord(input, "feedback");
const [sourcePath, feedbackPath] = await Promise.all([
  resolvePinnedProjectFile(sourceRef.path),
  resolvePinnedProjectFile(feedbackRef.path)
]);
const [sourceBytes, feedbackBytes] = await Promise.all([
  readFile(sourcePath),
  readFile(feedbackPath)
]);
if (sha256(sourceBytes) !== requiredString(sourceRef, "byteSha256")) {
  throw new Error("pinned source byte digest mismatch");
}
if (sha256(feedbackBytes) !== requiredString(feedbackRef, "byteSha256")) {
  throw new Error("pinned feedback byte digest mismatch");
}
const sourceDocument = JSON.parse(sourceBytes.toString("utf8")) as unknown;
if (digestWorkflow(sourceDocument) !== requiredString(sourceRef, "canonicalDigest")) {
  throw new Error("pinned source canonical digest mismatch");
}
const feedback = parseFeedback(feedbackBytes.toString("utf8"));
if (feedback.length === 0) throw new Error("feedback has no stable FB-* sections");
const pinnedIds = Array.isArray(feedbackRef.feedbackIds)
  ? feedbackRef.feedbackIds.filter((value): value is string => typeof value === "string")
  : [];
if (JSON.stringify(feedback.map((item) => item.id)) !== JSON.stringify(pinnedIds)) {
  throw new Error("feedback IDs changed after request pinning");
}

const requiredPointers = [
  "/meta",
  "/references",
  "/scope",
  "/glossary",
  "/actors",
  "/requirements",
  "/domainModel",
  "/stateMachines",
  "/apiContracts",
  "/screens",
  "/flows",
  "/dataBindings",
  "/authority",
  "/acceptance",
  "/nonFunctional",
  "/assumptions",
  "/openQuestions",
  "/traceability"
];
const allowedPathPrefixes = [
  ...requiredPointers,
  "/components",
  "/interactionModel",
  "/navModel",
  "/stateModel",
  "/mockData",
  "/demoStoryboard",
  "/roleBasedConsole"
];
const intent: SpecFeedbackIntent = {
  schemaVersion: "aawp/spec-feedback-intent/v1",
  sourceArtifactId: requiredString(sourceRef, "artifactId"),
  sourceDigest: requiredString(sourceRef, "canonicalDigest"),
  requestText: requiredString(feedbackRef, "requestText"),
  feedback,
  authority: { allowedPathPrefixes, allowRemove: false },
  profile: {
    id: requiredString(feedbackRef, "profileId"),
    requiredPointers
  }
};
const revisionContract = compileSpecFeedbackContract(intent, sourceDocument);
if (!isRecord(sourceDocument)) throw new Error("source spec must be an object");
const feedbackText = feedbackBytes.toString("utf8");
const affectedScreenIds = [
  ...new Set([...feedbackText.matchAll(/`(admin-[a-z0-9-]+)`/gu)].map((match) => String(match[1])))
];
const sourceScreens = Array.isArray(sourceDocument.screens) ? sourceDocument.screens : [];
const affectedScreens = sourceScreens.flatMap((screen, index) => {
  if (
    !isRecord(screen) ||
    typeof screen.id !== "string" ||
    !affectedScreenIds.includes(screen.id)
  ) {
    return [];
  }
  return [{ index, screen }];
});
const affectedActorIds = new Set(
  affectedScreens.flatMap(({ screen }) =>
    Array.isArray(screen.actors)
      ? screen.actors.filter((actor): actor is string => typeof actor === "string")
      : []
  )
);
const sourceActors = Array.isArray(sourceDocument.actors) ? sourceDocument.actors : [];
const affectedActors = sourceActors.flatMap((actor, index) =>
  isRecord(actor) && typeof actor.id === "string" && affectedActorIds.has(actor.id)
    ? [{ index, actor }]
    : []
);
const sourceInteractions = Array.isArray(sourceDocument.interactionModel)
  ? sourceDocument.interactionModel
  : [];
const affectedInteractions = sourceInteractions.flatMap((interaction, index) =>
  isRecord(interaction) &&
  typeof interaction.screenId === "string" &&
  affectedScreenIds.includes(interaction.screenId)
    ? [{ index, interaction }]
    : []
);
const projection = {
  schemaVersion: "aawp/spec-feedback-source-projection/v1",
  sourceCanonicalDigest: requiredString(sourceRef, "canonicalDigest"),
  sourceRootKeys: Object.keys(sourceDocument).sort(),
  affectedScreenIds,
  affectedScreens,
  affectedActors,
  affectedInteractions,
  navModel: sourceDocument.navModel,
  roleBasedConsole: sourceDocument.roleBasedConsole,
  componentNames: (Array.isArray(sourceDocument.components) ? sourceDocument.components : [])
    .filter(isRecord)
    .map((component) => component.name)
    .filter((name): name is string => typeof name === "string")
};
const content = {
  schemaVersion: "aawp/spec-feedback-runtime-contract/v1",
  source: sourceRef,
  feedback: feedbackRef,
  feedbackItems: feedback,
  revisionContract,
  compilerVersion: "spec-feedback-compiler/0.2.1",
  promotionStatus: "candidate"
};
const directory = await ensureArtifactDirectory();
await Promise.all([
  writeFile(resolve(directory, "contract.json"), `${JSON.stringify(content, null, 2)}\n`, {
    mode: 0o600
  }),
  writeFile(
    resolve(directory, "feedback.normalized.json"),
    `${JSON.stringify({ schemaVersion: "aawp/normalized-feedback/v1", items: feedback }, null, 2)}\n`,
    { mode: 0o600 }
  ),
  writeFile(
    resolve(directory, "source.affected-projection.json"),
    `${JSON.stringify(projection, null, 2)}\n`,
    { mode: 0o600 }
  )
]);
process.stdout.write(
  `${JSON.stringify({ contractDigest: revisionContract.digest, feedbackCount: feedback.length })}\n`
);
