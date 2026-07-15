import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDemoBundleManifest } from "../../packages/demo-bundle/dist/index.js";
import { canonicalize, sha256Hex } from "../../packages/ir/dist/index.js";
import { format } from "prettier";

const directory = dirname(fileURLToPath(import.meta.url));
const selectionPath = join(directory, "selection-manifest.json");
const selection = JSON.parse(await readFile(selectionPath, "utf8"));
const sourceBytes = await readFile(selection.source);
const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
if (sourceDigest !== selection.sourceSha256) {
  throw new Error(`source digest mismatch: ${sourceDigest}`);
}
const source = JSON.parse(sourceBytes.toString("utf8"));
const screenById = new Map(source.screens.map((screen) => [screen.id, screen]));
const selectedIds = selection.groups.flatMap((group) => group.screenIds);
const selectedScreens = selectedIds.map((id) => {
  const screen = screenById.get(id);
  if (!screen) throw new Error(`selected screen does not exist: ${id}`);
  return screen;
});

function formatJson(value) {
  return format(JSON.stringify(value), {
    parser: "json",
    printWidth: 100,
    singleQuote: false,
    trailingComma: "none"
  });
}

function surfaceId(label) {
  if (label === "관리 콘솔(웹)") return "admin-web";
  if (label === "발행사 콘솔(웹)") return "issuer-web";
  return `surface-${sha256Hex(label).slice(0, 10)}`;
}

function formFactor(label) {
  if (label.includes("모바일")) return "mobile";
  if (label.includes("태블릿")) return "tablet";
  if (label.includes("웹")) return "web";
  return "other";
}

const surfaces = [...new Set(selectedScreens.map((screen) => screen.surface))].map((label) => ({
  id: surfaceId(label),
  label,
  formFactor: formFactor(label),
  screenIds: selectedScreens.filter((screen) => screen.surface === label).map((screen) => screen.id)
}));
const groups = selection.groups.map((group) => ({
  id: group.id,
  label: group.label,
  kind: "topic",
  screenIds: group.screenIds
}));
const groupByScreen = new Map();
for (const group of groups) {
  for (const screenId of group.screenIds) {
    groupByScreen.set(screenId, [...(groupByScreen.get(screenId) ?? []), group.id]);
  }
}
const manifest = compileDemoBundleManifest({
  schemaVersion: "aawp/demo-bundle/v1",
  manifestId: "gyeonggi-policy-operations-20260715",
  title: "경기 통합월렛 운영 화면 묶음",
  requestText: selection.requestText,
  source: {
    artifactId: `refined-production-spec@sha256:${sourceDigest}`,
    contentDigest: sourceDigest
  },
  bundles: groups.map((group) => ({
    id: `${group.id}-bundle`,
    title: `${group.label} 화면 묶음`,
    description: `${group.screenIds.length}개 독립 화면`,
    groupIds: [group.id],
    screenIds: group.screenIds
  })),
  surfaces,
  groups,
  screens: selectedScreens.map((screen) => ({
    id: screen.id,
    title: screen.title,
    route: screen.route,
    surfaceId: surfaceId(screen.surface),
    groupIds: groupByScreen.get(screen.id),
    artifactPath: `screen-artifacts/${screen.id}.json`
  }))
});

const artifactDirectory = join(directory, "screen-artifacts");
await rm(artifactDirectory, { recursive: true, force: true });
await mkdir(artifactDirectory, { recursive: true });
for (const screen of selectedScreens) {
  const artifact = {
    schemaVersion: "aawp/demo-screen/v1",
    source: {
      artifactId: manifest.source.artifactId,
      contentDigest: manifest.source.contentDigest,
      pointer: `/screens/${source.screens.findIndex((item) => item.id === screen.id)}`,
      screenDigest: sha256Hex(canonicalize(screen))
    },
    screen
  };
  await writeFile(join(artifactDirectory, `${screen.id}.json`), await formatJson(artifact));
}
await writeFile(join(directory, "bundle-manifest.json"), await formatJson(manifest));
