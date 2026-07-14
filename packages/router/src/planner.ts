import { canonicalize, digestWorkflow } from "@awf/ir";

export type PlanBranchStatus = "pending" | "running" | "completed" | "cancelled";

export interface PlanBranch {
  id: string;
  question: string;
  artifactPartition: string;
  outputSchemaDigest: string;
  expectedInformationGain: number;
  maxCostUsd: number;
  status: PlanBranchStatus;
  evidenceArtifactIds: string[];
}

export interface PlanArtifact {
  planId: string;
  version: number;
  parentDigest: string | null;
  goalContractDigest: string;
  reason: string;
  branches: PlanBranch[];
  evidenceArtifactIds: string[];
  createdAt: string;
  digest: string;
}

export class PlanValidationError extends Error {
  constructor(
    readonly code:
      | "PLAN_NOT_FOUND"
      | "PLAN_VERSION_CONFLICT"
      | "DUPLICATE_BRANCH_ID"
      | "ARTIFACT_PARTITION_CONFLICT"
      | "INVALID_INFORMATION_GAIN"
      | "INVALID_BRANCH_COST"
      | "INVALID_STATUS_TRANSITION",
    message: string
  ) {
    super(message);
    this.name = "PlanValidationError";
  }
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateBranches(branches: PlanBranch[]): void {
  const ids = new Set<string>();
  const partitions = new Set<string>();
  for (const branch of branches) {
    if (ids.has(branch.id)) {
      throw new PlanValidationError("DUPLICATE_BRANCH_ID", `duplicate branch ${branch.id}`);
    }
    ids.add(branch.id);
    if (partitions.has(branch.artifactPartition)) {
      throw new PlanValidationError(
        "ARTIFACT_PARTITION_CONFLICT",
        `shared artifact partition ${branch.artifactPartition}`
      );
    }
    partitions.add(branch.artifactPartition);
    if (
      !Number.isFinite(branch.expectedInformationGain) ||
      branch.expectedInformationGain < 0 ||
      branch.expectedInformationGain > 1
    ) {
      throw new PlanValidationError(
        "INVALID_INFORMATION_GAIN",
        `invalid information gain for ${branch.id}`
      );
    }
    if (!Number.isFinite(branch.maxCostUsd) || branch.maxCostUsd < 0) {
      throw new PlanValidationError("INVALID_BRANCH_COST", `invalid cost for ${branch.id}`);
    }
  }
}

function snapshot<T>(value: T): T {
  const parsed = JSON.parse(canonicalize(value)) as T;
  const freeze = (current: unknown): unknown => {
    if (typeof current !== "object" || current === null || Object.isFrozen(current)) return current;
    for (const child of Object.values(current)) freeze(child);
    return Object.freeze(current);
  };
  return freeze(parsed) as T;
}

function buildPlan(input: Omit<PlanArtifact, "digest">): PlanArtifact {
  validateBranches(input.branches);
  const normalized = {
    ...input,
    branches: input.branches
      .map((branch) => ({
        ...branch,
        evidenceArtifactIds: [...new Set(branch.evidenceArtifactIds)].sort(utf16)
      }))
      .sort((left, right) => utf16(left.id, right.id)),
    evidenceArtifactIds: [...new Set(input.evidenceArtifactIds)].sort(utf16)
  };
  return snapshot({ ...normalized, digest: digestWorkflow(normalized) });
}

const allowedTransitions: Record<PlanBranchStatus, PlanBranchStatus[]> = {
  pending: ["pending", "running", "cancelled"],
  running: ["running", "completed", "cancelled"],
  completed: ["completed"],
  cancelled: ["cancelled"]
};

export class InMemoryPlanStore {
  private readonly versions = new Map<string, PlanArtifact[]>();

  create(input: {
    planId: string;
    goalContractDigest: string;
    reason: string;
    branches: PlanBranch[];
    createdAt: string;
  }): PlanArtifact {
    if (this.versions.has(input.planId)) {
      throw new PlanValidationError("PLAN_VERSION_CONFLICT", `plan already exists ${input.planId}`);
    }
    const plan = buildPlan({
      ...input,
      version: 1,
      parentDigest: null,
      evidenceArtifactIds: []
    });
    this.versions.set(input.planId, [plan]);
    return plan;
  }

  revise(input: {
    planId: string;
    expectedVersion: number;
    reason: string;
    branchUpdates?: Array<{
      id: string;
      status: PlanBranchStatus;
      evidenceArtifactIds?: string[];
    }>;
    addBranches?: PlanBranch[];
    evidenceArtifactIds?: string[];
    createdAt: string;
  }): PlanArtifact {
    const history = this.versions.get(input.planId);
    if (history === undefined) {
      throw new PlanValidationError("PLAN_NOT_FOUND", `plan not found ${input.planId}`);
    }
    const current = history.at(-1)!;
    if (current.version !== input.expectedVersion) {
      throw new PlanValidationError(
        "PLAN_VERSION_CONFLICT",
        `expected ${input.expectedVersion}, current ${current.version}`
      );
    }
    const updates = new Map((input.branchUpdates ?? []).map((update) => [update.id, update]));
    const branches = current.branches.map((branch): PlanBranch => {
      const update = updates.get(branch.id);
      if (update === undefined)
        return { ...branch, evidenceArtifactIds: [...branch.evidenceArtifactIds] };
      if (!allowedTransitions[branch.status].includes(update.status)) {
        throw new PlanValidationError(
          "INVALID_STATUS_TRANSITION",
          `${branch.id}: ${branch.status} -> ${update.status}`
        );
      }
      updates.delete(branch.id);
      return {
        ...branch,
        status: update.status,
        evidenceArtifactIds: [...branch.evidenceArtifactIds, ...(update.evidenceArtifactIds ?? [])]
      };
    });
    if (updates.size > 0) {
      throw new PlanValidationError(
        "PLAN_NOT_FOUND",
        `branch not found ${[...updates.keys()].sort(utf16).join(",")}`
      );
    }
    branches.push(...(input.addBranches ?? []));
    const plan = buildPlan({
      planId: current.planId,
      version: current.version + 1,
      parentDigest: current.digest,
      goalContractDigest: current.goalContractDigest,
      reason: input.reason,
      branches,
      evidenceArtifactIds: [...current.evidenceArtifactIds, ...(input.evidenceArtifactIds ?? [])],
      createdAt: input.createdAt
    });
    history.push(plan);
    return plan;
  }

  get(planId: string, version?: number): PlanArtifact | undefined {
    const history = this.versions.get(planId);
    return version === undefined
      ? history?.at(-1)
      : history?.find((plan) => plan.version === version);
  }
}

export function selectNextBranches(
  plan: PlanArtifact,
  budget: { maxBranches: number; remainingCostUsd: number; minInformationGain: number }
): PlanBranch[] {
  if (
    !Number.isInteger(budget.maxBranches) ||
    budget.maxBranches < 0 ||
    budget.remainingCostUsd < 0 ||
    budget.minInformationGain < 0 ||
    budget.minInformationGain > 1
  ) {
    throw new Error("invalid branch selection budget");
  }
  const candidates = plan.branches
    .filter(
      (branch) =>
        branch.status === "pending" && branch.expectedInformationGain >= budget.minInformationGain
    )
    .sort((left, right) => {
      const leftRatio = left.expectedInformationGain / Math.max(left.maxCostUsd, 0.000_001);
      const rightRatio = right.expectedInformationGain / Math.max(right.maxCostUsd, 0.000_001);
      return rightRatio - leftRatio || utf16(left.id, right.id);
    });
  const selected: PlanBranch[] = [];
  let remaining = budget.remainingCostUsd;
  for (const branch of candidates) {
    if (selected.length >= budget.maxBranches) break;
    if (branch.maxCostUsd > remaining) continue;
    selected.push(branch);
    remaining -= branch.maxCostUsd;
  }
  return selected;
}
