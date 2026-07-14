import { digestWorkflow } from "@awf/ir";
import type { ScopeContract } from "./contracts.js";
import {
  parseSpecDocument,
  parseSpecToDemoInput,
  type SpecDocument,
  type SpecToDemoInput
} from "./schema.js";

export class ScopeCompilationError extends Error {
  constructor(
    readonly code:
      | "SPEC_ARTIFACT_MISMATCH"
      | "DUPLICATE_SCREEN_ID"
      | "DUPLICATE_REQUIREMENT_KEY"
      | "UNKNOWN_SCOPE_SELECTOR"
      | "MAX_SCREENS_EXCEEDED",
    message: string
  ) {
    super(message);
    this.name = "ScopeCompilationError";
  }
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compileScopeContract(
  rawInput: SpecToDemoInput,
  rawDocument: SpecDocument
): ScopeContract {
  const input = parseSpecToDemoInput(rawInput);
  const document = parseSpecDocument(rawDocument);
  if (input.specArtifactId !== document.sourceArtifactId) {
    throw new ScopeCompilationError(
      "SPEC_ARTIFACT_MISMATCH",
      `input artifact ${input.specArtifactId} does not match document ${document.sourceArtifactId}`
    );
  }

  const screenIds = new Set<string>();
  const requirementKeys = new Set<string>();
  const selectorToRequirement = new Map<string, string>();
  for (const screen of document.screens) {
    if (screenIds.has(screen.id)) {
      throw new ScopeCompilationError("DUPLICATE_SCREEN_ID", `duplicate screen id ${screen.id}`);
    }
    screenIds.add(screen.id);
    for (const requirement of screen.requirements) {
      if (requirementKeys.has(requirement.key)) {
        throw new ScopeCompilationError(
          "DUPLICATE_REQUIREMENT_KEY",
          `duplicate requirement key ${requirement.key}`
        );
      }
      requirementKeys.add(requirement.key);
      selectorToRequirement.set(requirement.key, requirement.key);
      selectorToRequirement.set(`${screen.id}/${requirement.key}`, requirement.key);
    }
  }

  const selectors = input.selectedScope ?? [...screenIds];
  const selectedScreens = new Set<string>();
  const selectedRequirements = new Set<string>();
  for (const selector of selectors) {
    if (screenIds.has(selector)) {
      selectedScreens.add(selector);
      const screen = document.screens.find((item) => item.id === selector)!;
      for (const requirement of screen.requirements) selectedRequirements.add(requirement.key);
      continue;
    }
    const requirementKey = selectorToRequirement.get(selector);
    if (requirementKey === undefined) {
      throw new ScopeCompilationError(
        "UNKNOWN_SCOPE_SELECTOR",
        `unknown scope selector ${selector}`
      );
    }
    selectedRequirements.add(requirementKey);
    const screen = document.screens.find((item) =>
      item.requirements.some((requirement) => requirement.key === requirementKey)
    )!;
    selectedScreens.add(screen.id);
  }
  if (
    input.constraints?.maxScreens !== undefined &&
    selectedScreens.size > input.constraints.maxScreens
  ) {
    throw new ScopeCompilationError(
      "MAX_SCREENS_EXCEEDED",
      `selected ${selectedScreens.size} screens, maximum is ${input.constraints.maxScreens}`
    );
  }

  const content = {
    contractType: "scope" as const,
    documentId: document.documentId,
    sourceArtifactId: document.sourceArtifactId,
    includedScreenIds: [...selectedScreens].sort(utf16),
    excludedScreenIds: [...screenIds].filter((id) => !selectedScreens.has(id)).sort(utf16),
    selectedRequirementKeys: [...selectedRequirements].sort(utf16),
    allowedWrites: ["src/**", "public-tests/**"],
    forbiddenWrites: ["package.json", "verifier-hidden/**", "runtime/**"],
    forbiddenDependencies: [...(input.constraints?.forbiddenDependencies ?? [])].sort(utf16),
    targetViewports: [...input.targetViewports].sort(
      (left, right) => left.width - right.width || left.height - right.height
    ),
    accessibilityLevel: input.constraints?.accessibilityLevel ?? ("basic" as const)
  };
  return { ...content, digest: digestWorkflow(content) };
}
