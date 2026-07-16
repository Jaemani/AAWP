import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";

export interface SpecToDemoLauncherInput {
  sourcePath: string;
  screenIds: string[];
  requestText: string;
}

export interface PreparedSpecToDemoRequest {
  inputs: {
    brief: {
      schemaVersion: "aawp/spec-to-demo-brief/v1";
      requestText: string;
      sourceSpec: {
        path: string;
        originalFilename: string;
        byteSha256: string;
        originalByteSha256: string;
        projection: "requested-screen-closure-v1";
      };
      designContract: { path: "DESIGN.md"; version: string; byteSha256: string };
      requestedScreens: string[];
      demoArtifact: { relativePath: "artifacts/demo" };
    };
  };
  requestId: string;
  requestPath: string;
}

interface SourceScreen {
  id?: unknown;
  actors?: unknown;
  components?: unknown;
}

interface SourceSpec {
  meta?: unknown;
  actors?: unknown;
  components?: unknown;
  interactionModel?: unknown;
  screens?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function assertLauncherInput(input: SpecToDemoLauncherInput): void {
  if (typeof input.sourcePath !== "string" || input.sourcePath.trim().length === 0) {
    throw new Error("Source spec 경로를 입력하세요.");
  }
  if (isAbsolute(input.sourcePath)) {
    throw new Error("Source spec은 project-relative 경로여야 합니다.");
  }
  if (typeof input.requestText !== "string" || input.requestText.trim().length === 0) {
    throw new Error("화면 묶음 요청을 입력하세요.");
  }
  if (input.requestText.length > 4_000) throw new Error("요청은 4,000자를 넘을 수 없습니다.");
  if (!Array.isArray(input.screenIds) || input.screenIds.length === 0) {
    throw new Error("Screen ID를 하나 이상 입력하세요.");
  }
  if (input.screenIds.length > 100) throw new Error("한 run에서 screen은 최대 100개입니다.");
  if (input.screenIds.some((screenId) => typeof screenId !== "string" || screenId.length === 0)) {
    throw new Error("Screen ID는 빈 값일 수 없습니다.");
  }
}

async function resolveContainedFile(projectRoot: string, candidate: string): Promise<string> {
  const root = await realpath(resolve(projectRoot));
  const requested = resolve(root, candidate);
  const requestedRelative = relative(root, requested);
  if (
    requestedRelative === ".." ||
    requestedRelative.startsWith(`..${sep}`) ||
    isAbsolute(requestedRelative)
  ) {
    throw new Error("Source spec 경로가 project workspace를 벗어납니다.");
  }
  const canonical = await realpath(requested);
  const canonicalRelative = relative(root, canonical);
  if (
    canonicalRelative === ".." ||
    canonicalRelative.startsWith(`..${sep}`) ||
    isAbsolute(canonicalRelative)
  ) {
    throw new Error("Source spec symlink가 project workspace를 벗어납니다.");
  }
  return canonical;
}

function parseDesignVersion(source: string): string {
  const frontMatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
  const parsed = frontMatter === undefined ? undefined : (parseYaml(frontMatter) as unknown);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "string" &&
    parsed.version.trim().length > 0
  ) {
    return parsed.version.trim();
  }
  throw new Error("DESIGN.md has no version field");
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function projectSource(
  source: SourceSpec,
  requestedScreens: string[],
  sourceByteSha256: string
): Record<string, unknown> {
  if (!Array.isArray(source.screens)) throw new Error("source spec must contain screens[]");
  const screens = source.screens as SourceScreen[];
  const byScreenId = new Map(screens.map((screen) => [screen.id, screen]));
  const selected = requestedScreens.map((screenId) => {
    const screen = byScreenId.get(screenId);
    if (screen === undefined) throw new Error(`Source spec에 screen이 없습니다: ${screenId}`);
    return screen;
  });
  const actorIds = new Set(selected.flatMap((screen) => asStringArray(screen.actors)));
  const componentNames = new Set(selected.flatMap((screen) => asStringArray(screen.components)));
  const interactions = Array.isArray(source.interactionModel)
    ? source.interactionModel.filter(
        (interaction) =>
          typeof interaction === "object" &&
          interaction !== null &&
          "screenId" in interaction &&
          requestedScreens.includes(String(interaction.screenId))
      )
    : [];
  return {
    schemaVersion: "aawp/spec-to-demo-source-projection/v1",
    projection: {
      sourceByteSha256,
      requestedScreens,
      includedSections: ["meta", "actors", "components", "interactionModel", "screens"]
    },
    meta: {
      scenario: record(source.meta).scenario,
      stack: record(source.meta).stack,
      chosenDirection: record(source.meta).chosenDirection
    },
    actors: Array.isArray(source.actors)
      ? source.actors.filter(
          (actor) =>
            typeof actor === "object" &&
            actor !== null &&
            "id" in actor &&
            actorIds.has(String(actor.id))
        )
      : [],
    components: Array.isArray(source.components)
      ? source.components.filter(
          (component) =>
            typeof component === "object" &&
            component !== null &&
            "name" in component &&
            componentNames.has(String(component.name))
        )
      : [],
    interactionModel: interactions,
    screens: selected
  };
}

export async function prepareSpecToDemoRequest(input: {
  projectRoot: string;
  launcher: SpecToDemoLauncherInput;
}): Promise<PreparedSpecToDemoRequest> {
  assertLauncherInput(input.launcher);
  const projectRoot = await realpath(resolve(input.projectRoot));
  const sourcePath = await resolveContainedFile(projectRoot, input.launcher.sourcePath.trim());
  const sourceBytes = await readFile(sourcePath);
  if (sourceBytes.byteLength > 64 * 1024 * 1024)
    throw new Error("Source spec은 64 MiB 이하여야 합니다.");
  const source = JSON.parse(sourceBytes.toString("utf8")) as SourceSpec;
  const requestedScreens = [
    ...new Set(input.launcher.screenIds.map((screenId) => screenId.trim()))
  ];
  if (requestedScreens.some((screenId) => screenId.length === 0)) {
    throw new Error("Screen ID는 빈 값일 수 없습니다.");
  }

  const designPath = resolve(projectRoot, "DESIGN.md");
  const designBytes = await readFile(designPath);
  const originalSourceDigest = sha256(sourceBytes);
  const pinnedSource = projectSource(source, requestedScreens, originalSourceDigest);
  const pinnedSourceBytes = Buffer.from(`${JSON.stringify(pinnedSource, null, 2)}\n`);
  const requestId = `spec-to-demo-${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const requestDirectory = resolve(projectRoot, "runs", "requests", requestId);
  await mkdir(resolve(projectRoot, "runs", "requests"), { recursive: true });
  await mkdir(requestDirectory, { recursive: false });
  const pinnedSourcePath = resolve(requestDirectory, "source-spec.json");
  await writeFile(pinnedSourcePath, pinnedSourceBytes, { mode: 0o600 });

  const prepared: PreparedSpecToDemoRequest = {
    inputs: {
      brief: {
        schemaVersion: "aawp/spec-to-demo-brief/v1",
        requestText: input.launcher.requestText.trim(),
        sourceSpec: {
          path: portableRelative(projectRoot, pinnedSourcePath),
          originalFilename: basename(sourcePath),
          byteSha256: sha256(pinnedSourceBytes),
          originalByteSha256: originalSourceDigest,
          projection: "requested-screen-closure-v1"
        },
        designContract: {
          path: "DESIGN.md",
          version: parseDesignVersion(designBytes.toString("utf8")),
          byteSha256: sha256(designBytes)
        },
        requestedScreens,
        demoArtifact: { relativePath: "artifacts/demo" }
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
