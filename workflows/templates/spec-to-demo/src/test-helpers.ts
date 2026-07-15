import { readFile } from "node:fs/promises";
import type { SpecDocument, SpecToDemoInput } from "./compiler/index.js";
import { parseSpecDocument } from "./compiler/index.js";

export const fixtureNames = ["checkout", "settings", "dashboard", "onboarding", "catalog"] as const;

export async function loadFixture(name: (typeof fixtureNames)[number]): Promise<SpecDocument> {
  const raw = await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8");
  return parseSpecDocument(JSON.parse(raw));
}

export function inputFor(
  document: SpecDocument,
  overrides: Partial<SpecToDemoInput> = {}
): SpecToDemoInput {
  const hasSelectionOverride =
    Object.hasOwn(overrides, "selectedScope") || Object.hasOwn(overrides, "scopeSelection");
  return {
    specArtifactId: document.sourceArtifactId,
    ...(hasSelectionOverride ? {} : { selectedScope: document.screens.map((screen) => screen.id) }),
    demoProfile: "web-react",
    targetViewports: [
      { width: 390, height: 844 },
      { width: 1440, height: 900 }
    ],
    constraints: { accessibilityLevel: "wcag-aa-target", maxScreens: 5 },
    ...overrides
  };
}
