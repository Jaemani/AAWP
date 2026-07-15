import type { SpecRequirement, SourceSpan } from "./schema.js";

export interface ScopeContract {
  contractType: "scope";
  documentId: string;
  sourceArtifactId: string;
  includedScreenIds: string[];
  excludedScreenIds: string[];
  selectedRequirementKeys: string[];
  selectedGroupIds: string[];
  requestText?: string;
  allowedWrites: string[];
  forbiddenWrites: string[];
  forbiddenDependencies: string[];
  targetViewports: Array<{ width: number; height: number }>;
  accessibilityLevel: "basic" | "wcag-aa-target";
  digest: string;
}

export interface CompiledRequirement {
  id: string;
  sourceKey: string;
  screenId: string;
  screenTitle: string;
  route: string;
  text: string;
  kind: SpecRequirement["kind"];
  publicCriterion: string;
  sourceArtifactId: string;
  sourceSpan: SourceSpan;
  preconditions: SpecRequirement["preconditions"];
  actions: SpecRequirement["actions"];
  oracles: SpecRequirement["oracles"];
}

export interface RequirementContract {
  contractType: "requirements";
  documentId: string;
  sourceArtifactId: string;
  requirements: CompiledRequirement[];
  digest: string;
}

export interface CompiledSpecContracts {
  scope: ScopeContract;
  requirements: RequirementContract;
}
