export type ContractDecisionStatus =
  "confirmed" | "assumed" | "unresolved" | "conflicting" | "deprecated" | "candidate";

export type PreviewBlockerOwner = "data" | "api" | "authority" | "environment" | "product-decision";

export interface PreviewContractSource {
  artifactPath: string;
  byteSha256: string;
  canonicalDigest?: string;
}

export interface PreviewBlockerInput {
  id: string;
  code: string;
  message: string;
  pointers?: string[];
  objectIds?: string[];
  sourceRefs?: string[];
  owner?: string;
  question?: string;
}

export interface RoutedPreviewBlocker extends PreviewBlockerInput {
  contractOwners: PreviewBlockerOwner[];
}

export interface LogicalEntityContract {
  id: string;
  name?: string;
  responsibility?: string;
  relationships: string[];
  status: ContractDecisionStatus;
  sourceRefs: string[];
  physicalStorage: {
    status: "unresolved";
    reason: string;
  };
}

export interface QueryDataContract {
  id: string;
  status: ContractDecisionStatus;
  reads: string[];
  responseFields: string[];
  capabilityId?: string;
  sourceRefs: string[];
}

export interface ScreenDataBindingContract {
  screenId: string;
  status: ContractDecisionStatus;
  queryRefs: string[];
  commandRefs: string[];
  unresolvedGaps: string[];
  fieldSourcePolicy?: string;
  sourceRefs: string[];
}

export interface DataContract {
  schemaVersion: "aawp/data-contract/v1";
  source: PreviewContractSource;
  targetMaturity: "S2";
  status: "ready" | "blocked";
  entities: LogicalEntityContract[];
  queries: QueryDataContract[];
  bindings: ScreenDataBindingContract[];
  blockerIds: string[];
  unsupportedPhysicalDecisions: string[];
  digest: string;
}

export interface ApiCommandContract {
  id: string;
  status: ContractDecisionStatus;
  capabilityId?: string;
  transitionRef?: string;
  requires: string[];
  mutates: string[];
  creates: string[];
  separatesFrom: string[];
  optimisticConcurrency: {
    required: boolean;
    source: "resourceVersion" | "missing";
  };
  idempotency: {
    required: boolean;
    source: "idempotencyKey" | "declared-policy" | "missing";
    policy?: string;
  };
  sourceRefs: string[];
}

export interface ApiQueryContract {
  id: string;
  status: ContractDecisionStatus;
  capabilityId?: string;
  reads: string[];
  responseFields: string[];
  sourceRefs: string[];
}

export interface ApiContract {
  schemaVersion: "aawp/api-contract/v1";
  source: PreviewContractSource;
  targetMaturity: "S2";
  status: "ready" | "blocked";
  commands: ApiCommandContract[];
  queries: ApiQueryContract[];
  unresolvedContracts: unknown[];
  blockerIds: string[];
  transport: {
    status: "unresolved";
    reason: string;
  };
  digest: string;
}

export interface PreviewBlockerRouting {
  schemaVersion: "aawp/preview-blocker-routing/v1";
  status: "ready" | "blocked";
  blockers: RoutedPreviewBlocker[];
  byOwner: Record<PreviewBlockerOwner, string[]>;
  digest: string;
}

export interface PreviewContractCompilation {
  status: "ready" | "blocked";
  dataContract: DataContract;
  apiContract: ApiContract;
  blockerRouting: PreviewBlockerRouting;
}
