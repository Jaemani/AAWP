import type { ApiContract, DataContract } from "./contracts.js";

export interface PreviewEnvironmentRequest {
  tenantId: string;
  runId: string;
  dataContract: DataContract;
  apiContract: ApiContract;
  leaseMs: number;
  networkPolicy: "deny-all" | "allowlisted";
  seedArtifact?: {
    path: string;
    byteSha256: string;
  };
}

export interface PreviewEnvironmentHandle {
  environmentId: string;
  status: "ready" | "expired" | "destroyed";
  createdAt: string;
  expiresAt: string;
  databaseRef: {
    kind: "opaque-local" | "brokered-remote";
    reference: string;
  };
  contractDigests: {
    data: string;
    api: string;
  };
  networkPolicy: "deny-all" | "allowlisted";
}

export interface PreviewEnvironmentPort {
  readonly name: string;
  provision(request: PreviewEnvironmentRequest): Promise<PreviewEnvironmentHandle>;
  inspect(environmentId: string): Promise<PreviewEnvironmentHandle | undefined>;
  destroy(environmentId: string): Promise<PreviewEnvironmentHandle | undefined>;
}

export class PreviewContractBlockedError extends Error {
  readonly code = "PREVIEW_CONTRACT_BLOCKED";

  constructor(readonly blockerIds: string[]) {
    super(`preview contracts are blocked by ${blockerIds.length} finding(s)`);
    this.name = "PreviewContractBlockedError";
  }
}

export function assertPreviewContractsReady(request: PreviewEnvironmentRequest): void {
  const blockerIds = [
    ...new Set([...request.dataContract.blockerIds, ...request.apiContract.blockerIds])
  ].sort();
  if (
    request.dataContract.status !== "ready" ||
    request.apiContract.status !== "ready" ||
    blockerIds.length > 0
  ) {
    throw new PreviewContractBlockedError(blockerIds);
  }
}
