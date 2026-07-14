import type { CompiledRequirement, RequirementContract, ScopeContract } from "../compiler/index.js";

export interface AcceptanceAction {
  actor: "user" | "external_system";
  operation: "visit" | "click" | "type" | "select" | "submit";
  targetSemanticRole?: string;
  accessibleName?: string;
  value?: string;
  fixtureRef?: string;
}

export interface AcceptanceOracle {
  type: "dom" | "navigation" | "state" | "network" | "visual" | "a11y";
  assertion: Record<string, unknown>;
}

export interface AcceptanceObligation {
  id: string;
  requirementId: string;
  route: string;
  preconditions: Array<Record<string, unknown>>;
  actions: AcceptanceAction[];
  oracles: AcceptanceOracle[];
}

export interface AcceptanceContract {
  contractType: "acceptance";
  requirementContractDigest: string;
  scopeContractDigest: string;
  obligations: AcceptanceObligation[];
  digest: string;
}

export interface PublicRequirementBrief {
  id: string;
  screenId: string;
  screenTitle: string;
  route: string;
  text: string;
  publicCriterion: string;
}

export interface PublicImplementationBrief {
  briefType: "spec-to-demo-public";
  title: string;
  requirements: PublicRequirementBrief[];
  includedScreenIds: string[];
  allowedWrites: string[];
  forbiddenDependencies: string[];
  targetViewports: Array<{ width: number; height: number }>;
  accessibilityLevel: ScopeContract["accessibilityLevel"];
  fixtureProtocol: {
    version: "awf/fixture/v1";
    endpoint: "/__awf/fixtures/:key";
    keys: string[];
  };
  digest: string;
}

export interface HiddenVerifierFile {
  path: string;
  content: string;
  contentHash: string;
}

export interface HiddenVerifierPackage {
  packageType: "spec-to-demo-hidden";
  packageDigest: string;
  acceptanceContractDigest: string;
  verifier: Omit<import("@awf/verifier-sdk").VerifierDefinition, "image">;
  files: HiddenVerifierFile[];
}

export interface AcceptanceCompilation {
  contract: AcceptanceContract;
  publicBrief: PublicImplementationBrief;
  hiddenPackage: HiddenVerifierPackage;
}

export type RequirementForAcceptance = CompiledRequirement;
export type RequirementsForAcceptance = RequirementContract;
