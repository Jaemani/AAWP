import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDemoBundleManifest } from "../../packages/demo-bundle/dist/index.js";
import { canonicalize, sha256Hex } from "../../packages/ir/dist/index.js";
import { format } from "prettier";
import { parse as parseYaml } from "yaml";

const directory = dirname(fileURLToPath(import.meta.url));
const selectionPath = join(directory, "selection-manifest.json");
const presentationPath = join(directory, "presentation-contract.yaml");
const selection = JSON.parse(await readFile(selectionPath, "utf8"));
const presentationBytes = await readFile(presentationPath);
const presentation = parseYaml(presentationBytes.toString("utf8"));
const presentationDigest = createHash("sha256").update(presentationBytes).digest("hex");
const sourceBytes = await readFile(selection.source);
const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
if (sourceDigest !== selection.sourceSha256) {
  throw new Error(`source digest mismatch: ${sourceDigest}`);
}
const source = JSON.parse(sourceBytes.toString("utf8"));
const screenById = new Map(source.screens.map((screen) => [screen.id, screen]));
const componentByName = new Map(source.components.map((component) => [component.name, component]));
const selectedIds = selection.groups.flatMap((group) => group.screenIds);
const selectedIdSet = new Set(selectedIds);
const selectedScreens = selectedIds.map((id) => {
  const screen = screenById.get(id);
  if (!screen) throw new Error(`selected screen does not exist: ${id}`);
  return screen;
});
const selectedComponentNames = [...new Set(selectedScreens.flatMap((screen) => screen.components))];
const selectedComponentDefinitions = selectedComponentNames.map((componentName) => {
  const component = componentByName.get(componentName);
  if (!component) throw new Error(`component definition does not exist: ${componentName}`);
  return component;
});
const sourceContracts = {
  schemaVersion: "aawp/demo-source-contracts/v1",
  source: {
    artifactId: `refined-production-spec@sha256:${sourceDigest}`,
    contentDigest: sourceDigest
  },
  presentationContract: {
    path: "presentation-contract.yaml",
    contentDigest: presentationDigest,
    schemaVersion: presentation.schemaVersion,
    name: presentation.name
  },
  designSystem: source.designTokens,
  components: selectedComponentDefinitions
};
const sourceContractsDigest = sha256Hex(canonicalize(sourceContracts));

function interactionFor(screenId) {
  return (
    source.interactionModel.find((interaction) => interaction.screenId === screenId) ?? {
      screenId,
      affordances: [],
      reachableStates: []
    }
  );
}

function resolveAffordance(affordance) {
  if (affordance.action !== "navigate") {
    return { kind: "demo-state", target: affordance.target };
  }
  if (selectedIdSet.has(affordance.target)) {
    return { kind: "selected-screen", screenId: affordance.target };
  }
  if (screenById.has(affordance.target)) {
    return {
      kind: "out-of-scope-screen",
      screenId: affordance.target,
      reason: "목적지는 원본 spec에 있지만 이번 요청 화면 묶음에는 포함되지 않았습니다."
    };
  }
  return {
    kind: "unresolved-navigation",
    target: affordance.target,
    reason: "원본 spec에서 이동 목적지를 screen ID로 확인할 수 없습니다."
  };
}

function navigationFor(screen) {
  const shell = source.navModel.shells.find((candidate) => candidate.surface === screen.surface);
  if (!shell) return null;
  return {
    type: shell.type,
    items: shell.items.map((item) => ({
      ...item,
      resolution: selectedIdSet.has(item.target)
        ? { kind: "selected-screen", screenId: item.target }
        : screenById.has(item.target)
          ? {
              kind: "out-of-scope-screen",
              screenId: item.target,
              reason: "이 메뉴는 원본 spec에 있지만 이번 요청 화면 묶음에는 포함되지 않았습니다."
            }
          : {
              kind: "unresolved-navigation",
              target: item.target,
              reason: "원본 spec에서 메뉴 목적지를 확인할 수 없습니다."
            }
    }))
  };
}

function formatJson(value) {
  return format(JSON.stringify(value), {
    parser: "json",
    printWidth: 100,
    singleQuote: false,
    trailingComma: "none"
  });
}

function cssName(value) {
  return value.replaceAll(/[^A-Za-z0-9-]/g, "-").toLowerCase();
}

function cssFamily(value, fallbacks) {
  const family = value.includes(" ") ? `"${value}"` : value;
  return [family, ...fallbacks].join(", ");
}

function presentationCss(contract) {
  const declarations = [];
  for (const [name, value] of Object.entries(contract.colors)) {
    declarations.push(`--color-${cssName(name)}: ${value};`);
  }
  for (const [role, token] of Object.entries(contract.typography)) {
    const prefix = `--type-${cssName(role)}`;
    const fallbacks =
      role === "mono"
        ? ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
        : ["Inter", "Pretendard", "sans-serif"];
    declarations.push(`${prefix}-family: ${cssFamily(token.fontFamily, fallbacks)};`);
    declarations.push(`${prefix}-size: ${token.fontSize};`);
    declarations.push(`${prefix}-weight: ${token.fontWeight};`);
    declarations.push(`${prefix}-line-height: ${token.lineHeight};`);
    if (token.letterSpacing) declarations.push(`${prefix}-letter-spacing: ${token.letterSpacing};`);
  }
  for (const [name, value] of Object.entries(contract.rounded)) {
    declarations.push(`--radius-${cssName(name)}: ${value};`);
  }
  for (const [name, value] of Object.entries(contract.spacing)) {
    declarations.push(`--spacing-${cssName(name)}: ${value};`);
  }
  declarations.push(
    `--font-sans: ${cssFamily(contract.typography.body.fontFamily, ["Inter", "Pretendard", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "sans-serif"])};`,
    `--font-mono: ${cssFamily(contract.typography.mono.fontFamily, ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"])};`
  );
  return format(`:root {\n${declarations.join("\n")}\n}`, { parser: "css" });
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
  const interaction = interactionFor(screen.id);
  const affordances = interaction.affordances.map((affordance) => ({
    ...affordance,
    resolution: resolveAffordance(affordance)
  }));
  const specFeedback = affordances
    .filter((affordance) => affordance.resolution.kind === "unresolved-navigation")
    .map((affordance) => ({
      kind: "ambiguous-navigation-target",
      interactionId: affordance.id,
      sourceTarget: affordance.target,
      message: affordance.resolution.reason
    }));
  const artifact = {
    schemaVersion: "aawp/demo-screen/v1",
    source: {
      artifactId: manifest.source.artifactId,
      contentDigest: manifest.source.contentDigest,
      pointer: `/screens/${source.screens.findIndex((item) => item.id === screen.id)}`,
      screenDigest: sha256Hex(canonicalize(screen))
    },
    screen,
    sourceContracts: {
      path: "source-contracts.json",
      contentDigest: sourceContractsDigest,
      componentNames: screen.components
    },
    renderer: {
      adapterId: "aawp-console-surface",
      adapterVersion: "0.2.0",
      presentationDigest,
      formFactor: formFactor(screen.surface)
    },
    navigation: navigationFor(screen),
    interactions: {
      affordances,
      reachableStates: interaction.reachableStates
    },
    specFeedback
  };
  await writeFile(join(artifactDirectory, `${screen.id}.json`), await formatJson(artifact));
}
await writeFile(join(directory, "source-contracts.json"), await formatJson(sourceContracts));
await writeFile(join(directory, "bundle-manifest.json"), await formatJson(manifest));
await writeFile(join(directory, "design-tokens.css"), await presentationCss(presentation));
