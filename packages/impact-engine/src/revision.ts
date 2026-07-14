import { canonicalize, type WorkflowDefinition } from "@awf/ir";

export interface NodeExecutionProfile {
  promptTemplateDigest: string | null;
  modelDigest: string | null;
  toolSchemaDigest: string;
  environmentImageDigest: string;
  policyVersion: string;
  verifierPolicyDigest: string;
  workspaceBaseTreeHash: string;
}

export interface RevisionState {
  workflow: WorkflowDefinition;
  inputArtifactHashes: Record<string, string>;
  contractDigests: Record<string, string>;
  contractConsumers: Record<string, string[]>;
  executionProfiles: Record<string, NodeExecutionProfile>;
}

export interface RevisionBranchSnapshot {
  revisionId: string;
  tenantId: string;
  runId: string;
  branchId: string;
  parentBranchId: string | null;
  createdAt: string;
  state: RevisionState;
}

export type StoredRevisionBranch = Readonly<RevisionBranchSnapshot>;

export interface RevisionPatch {
  workflow?: WorkflowDefinition;
  inputArtifactHashes?: Record<string, string | null>;
  contractDigests?: Record<string, string | null>;
  contractConsumers?: Record<string, string[] | null>;
  executionProfiles?: Record<string, NodeExecutionProfile | null>;
}

export class RevisionBranchConflictError extends Error {
  constructor(readonly branchId: string) {
    super(`revision branch already exists: ${branchId}`);
    this.name = "RevisionBranchConflictError";
  }
}

export class RevisionParentNotFoundError extends Error {
  constructor(readonly branchId: string) {
    super(`revision parent branch not found: ${branchId}`);
    this.name = "RevisionParentNotFoundError";
  }
}

function branchKey(tenantId: string, runId: string, branchId: string): string {
  return `${tenantId}\0${runId}\0${branchId}`;
}

function deepFreeze(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function snapshot<T>(value: T): T {
  return deepFreeze(JSON.parse(canonicalize(value)) as T) as T;
}

function patchMap<T>(base: Record<string, T>, patch?: Record<string, T | null>): Record<string, T> {
  const result = { ...base };
  for (const key of Object.keys(patch ?? {}).sort()) {
    const value = patch?.[key];
    if (value === null) delete result[key];
    else if (value !== undefined) result[key] = value;
  }
  return result;
}

function applyPatch(parent: RevisionState, patch: RevisionPatch): RevisionState {
  return {
    workflow: patch.workflow ?? parent.workflow,
    inputArtifactHashes: patchMap(parent.inputArtifactHashes, patch.inputArtifactHashes),
    contractDigests: patchMap(parent.contractDigests, patch.contractDigests),
    contractConsumers: patchMap(parent.contractConsumers, patch.contractConsumers),
    executionProfiles: patchMap(parent.executionProfiles, patch.executionProfiles)
  };
}

export class InMemoryRevisionStore {
  private readonly branches = new Map<string, StoredRevisionBranch>();

  registerBase(input: Omit<RevisionBranchSnapshot, "parentBranchId">): StoredRevisionBranch {
    return this.put({ ...input, parentBranchId: null });
  }

  createRevision(input: {
    revisionId: string;
    tenantId: string;
    runId: string;
    branchId: string;
    parentBranchId: string;
    createdAt: string;
    patch: RevisionPatch;
  }): StoredRevisionBranch {
    const parent = this.get(input.tenantId, input.runId, input.parentBranchId);
    if (parent === undefined) throw new RevisionParentNotFoundError(input.parentBranchId);
    return this.put({
      revisionId: input.revisionId,
      tenantId: input.tenantId,
      runId: input.runId,
      branchId: input.branchId,
      parentBranchId: input.parentBranchId,
      createdAt: input.createdAt,
      state: applyPatch(parent.state, snapshot(input.patch))
    });
  }

  get(tenantId: string, runId: string, branchId: string): StoredRevisionBranch | undefined {
    return this.branches.get(branchKey(tenantId, runId, branchId));
  }

  private put(input: RevisionBranchSnapshot): StoredRevisionBranch {
    const key = branchKey(input.tenantId, input.runId, input.branchId);
    if (this.branches.has(key)) throw new RevisionBranchConflictError(input.branchId);
    const stored = snapshot(input) as StoredRevisionBranch;
    this.branches.set(key, stored);
    return stored;
  }
}
