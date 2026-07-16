import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { digestWorkflow } from "@awf/ir";

export interface SpecFeedbackLauncherInput {
  sourcePath: string;
  feedbackPath: string;
  requestText: string;
  targetMaturity: "S1" | "S2";
  baseRunId?: string;
}

export interface PreparedSpecFeedbackRequest {
  inputs: {
    source: {
      schemaVersion: "aawp/spec-source-ref/v1";
      artifactId: string;
      path: string;
      originalFilename: string;
      byteSha256: string;
      canonicalDigest: string;
    };
    feedback: {
      schemaVersion: "aawp/spec-feedback-ref/v1";
      artifactId: string;
      path: string;
      originalFilename: string;
      byteSha256: string;
      feedbackIds: string[];
      requestText: string;
      targetMaturity: "S1" | "S2";
      profileId: "gyeonggi-policy-backoffice-spec/v2";
      repairBase?: {
        runId: string;
        proposalPath: string;
        proposalDigest: string;
        gapPath: string;
        gapDigest: string;
      };
    };
  };
  requestId: string;
  requestPath: string;
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

async function resolveContainedFile(projectRoot: string, candidate: string): Promise<string> {
  if (isAbsolute(candidate)) throw new Error("입력 파일은 project-relative 경로여야 합니다.");
  const root = await realpath(resolve(projectRoot));
  const requested = resolve(root, candidate);
  const requestedRelative = relative(root, requested);
  if (
    requestedRelative === ".." ||
    requestedRelative.startsWith(`..${sep}`) ||
    isAbsolute(requestedRelative)
  ) {
    throw new Error("입력 파일 경로가 project workspace를 벗어납니다.");
  }
  const canonical = await realpath(requested);
  const canonicalRelative = relative(root, canonical);
  if (
    canonicalRelative === ".." ||
    canonicalRelative.startsWith(`..${sep}`) ||
    isAbsolute(canonicalRelative)
  ) {
    throw new Error("입력 파일 symlink가 project workspace를 벗어납니다.");
  }
  return canonical;
}

function feedbackIds(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/^###\s+(FB-[A-Z]+-\d+)\s+—/gmu)].map((match) => String(match[1]))
    )
  ];
}

function assertLauncher(input: SpecFeedbackLauncherInput): void {
  if (input.sourcePath.trim().length === 0) throw new Error("기준 Spec 경로를 입력하세요.");
  if (input.feedbackPath.trim().length === 0) throw new Error("피드백 경로를 입력하세요.");
  if (input.requestText.trim().length === 0) throw new Error("revision 요청을 입력하세요.");
  if (input.requestText.length > 8_000) throw new Error("요청은 8,000자를 넘을 수 없습니다.");
  if (!(["S1", "S2"] as const).includes(input.targetMaturity)) {
    throw new Error("목표 성숙도는 S1 또는 S2여야 합니다.");
  }
  if (input.baseRunId !== undefined && !/^run_[a-zA-Z0-9-]+$/u.test(input.baseRunId)) {
    throw new Error("Repair base run ID 형식이 잘못되었습니다.");
  }
}

export async function prepareSpecFeedbackRequest(input: {
  projectRoot: string;
  launcher: SpecFeedbackLauncherInput;
}): Promise<PreparedSpecFeedbackRequest> {
  assertLauncher(input.launcher);
  const projectRoot = await realpath(resolve(input.projectRoot));
  const [sourcePath, feedbackPath] = await Promise.all([
    resolveContainedFile(projectRoot, input.launcher.sourcePath.trim()),
    resolveContainedFile(projectRoot, input.launcher.feedbackPath.trim())
  ]);
  const [sourceBytes, feedbackBytes] = await Promise.all([
    readFile(sourcePath),
    readFile(feedbackPath)
  ]);
  if (sourceBytes.byteLength > 64 * 1024 * 1024)
    throw new Error("기준 Spec은 64 MiB 이하여야 합니다.");
  if (feedbackBytes.byteLength > 2 * 1024 * 1024)
    throw new Error("피드백은 2 MiB 이하여야 합니다.");
  const sourceDocument = JSON.parse(sourceBytes.toString("utf8")) as unknown;
  const ids = feedbackIds(feedbackBytes.toString("utf8"));
  if (ids.length === 0) throw new Error("피드백 문서에서 stable FB-* ID를 찾지 못했습니다.");

  const requestId = `spec-feedback-${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const requestDirectory = resolve(projectRoot, "runs", "requests", requestId);
  await mkdir(resolve(projectRoot, "runs", "requests"), { recursive: true });
  await mkdir(requestDirectory, { recursive: false });
  const pinnedSourcePath = resolve(requestDirectory, "source-spec.json");
  const pinnedFeedbackPath = resolve(requestDirectory, "feedback.md");
  await Promise.all([
    writeFile(pinnedSourcePath, sourceBytes, { mode: 0o600 }),
    writeFile(pinnedFeedbackPath, feedbackBytes, { mode: 0o600 })
  ]);

  const sourceByteSha256 = sha256(sourceBytes);
  const feedbackByteSha256 = sha256(feedbackBytes);
  let repairBase: PreparedSpecFeedbackRequest["inputs"]["feedback"]["repairBase"];
  if (input.launcher.baseRunId !== undefined) {
    const baseDirectory = resolve(
      projectRoot,
      "runs",
      input.launcher.baseRunId,
      "artifacts",
      "spec-revision"
    );
    const [baseProposalPath, baseGapPath, baseContractPath] = await Promise.all([
      resolveContainedFile(
        projectRoot,
        portableRelative(projectRoot, resolve(baseDirectory, "patch-proposal.json"))
      ),
      resolveContainedFile(
        projectRoot,
        portableRelative(projectRoot, resolve(baseDirectory, "gap-report.json"))
      ),
      resolveContainedFile(
        projectRoot,
        portableRelative(projectRoot, resolve(baseDirectory, "contract.json"))
      )
    ]);
    const [proposalBytes, gapBytes, contractBytes] = await Promise.all([
      readFile(baseProposalPath),
      readFile(baseGapPath),
      readFile(baseContractPath)
    ]);
    const contract = JSON.parse(contractBytes.toString("utf8")) as {
      source?: { canonicalDigest?: unknown };
      feedback?: { byteSha256?: unknown };
    };
    if (
      contract.source?.canonicalDigest !== digestWorkflow(sourceDocument) ||
      contract.feedback?.byteSha256 !== feedbackByteSha256
    ) {
      throw new Error("Repair base run의 source 또는 feedback digest가 현재 입력과 다릅니다.");
    }
    const pinnedProposalPath = resolve(requestDirectory, "repair-base-proposal.json");
    const pinnedGapPath = resolve(requestDirectory, "repair-base-gap.json");
    await Promise.all([
      writeFile(pinnedProposalPath, proposalBytes, { mode: 0o600 }),
      writeFile(pinnedGapPath, gapBytes, { mode: 0o600 })
    ]);
    repairBase = {
      runId: input.launcher.baseRunId,
      proposalPath: portableRelative(projectRoot, pinnedProposalPath),
      proposalDigest: sha256(proposalBytes),
      gapPath: portableRelative(projectRoot, pinnedGapPath),
      gapDigest: sha256(gapBytes)
    };
  }
  const prepared: PreparedSpecFeedbackRequest = {
    inputs: {
      source: {
        schemaVersion: "aawp/spec-source-ref/v1",
        artifactId: `spec_${sourceByteSha256}`,
        path: portableRelative(projectRoot, pinnedSourcePath),
        originalFilename: basename(sourcePath),
        byteSha256: sourceByteSha256,
        canonicalDigest: digestWorkflow(sourceDocument)
      },
      feedback: {
        schemaVersion: "aawp/spec-feedback-ref/v1",
        artifactId: `feedback_${feedbackByteSha256}`,
        path: portableRelative(projectRoot, pinnedFeedbackPath),
        originalFilename: basename(feedbackPath),
        byteSha256: feedbackByteSha256,
        feedbackIds: ids,
        requestText: input.launcher.requestText.trim(),
        targetMaturity: input.launcher.targetMaturity,
        profileId: "gyeonggi-policy-backoffice-spec/v2",
        ...(repairBase === undefined ? {} : { repairBase })
      }
    },
    requestId,
    requestPath: portableRelative(projectRoot, resolve(requestDirectory, "request.json"))
  };
  await writeFile(
    resolve(requestDirectory, "request.json"),
    `${JSON.stringify(prepared.inputs, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  return prepared;
}
