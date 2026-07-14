import type { StoredRevisionBranch } from "./revision.js";

export interface BranchPointer {
  tenantId: string;
  runId: string;
  activeBranchId: string;
  generation: number;
}

export interface RevisionBranchReader {
  get(tenantId: string, runId: string, branchId: string): StoredRevisionBranch | undefined;
}

export interface BranchPointerCompareAndSwap {
  compareAndSwap(
    tenantId: string,
    runId: string,
    branchId: string,
    expectedGeneration: number
  ): Readonly<BranchPointer>;
}

export class BranchPointerConflictError extends Error {
  constructor(readonly expectedGeneration: number) {
    super(`branch compare-and-swap failed at generation ${expectedGeneration}`);
    this.name = "BranchPointerConflictError";
  }
}

export class CandidateReleaseGateError extends Error {
  constructor(readonly branchId: string) {
    super(`candidate branch did not pass its release gate: ${branchId}`);
    this.name = "CandidateReleaseGateError";
  }
}

export class ActiveRunNotFoundError extends Error {
  constructor(readonly runId: string) {
    super(`active run pointer not found: ${runId}`);
    this.name = "ActiveRunNotFoundError";
  }
}

function pointerKey(tenantId: string, runId: string): string {
  return `${tenantId}\0${runId}`;
}

function snapshot(pointer: BranchPointer): Readonly<BranchPointer> {
  return Object.freeze({ ...pointer });
}

export class InMemoryBranchPointerStore {
  private readonly pointers = new Map<string, Readonly<BranchPointer>>();

  register(
    pointer: Omit<BranchPointer, "generation"> & { generation?: number }
  ): Readonly<BranchPointer> {
    const key = pointerKey(pointer.tenantId, pointer.runId);
    if (this.pointers.has(key)) throw new BranchPointerConflictError(pointer.generation ?? 0);
    if (!Number.isInteger(pointer.generation ?? 0) || (pointer.generation ?? 0) < 0) {
      throw new BranchPointerConflictError(pointer.generation ?? 0);
    }
    const stored = snapshot({ ...pointer, generation: pointer.generation ?? 0 });
    this.pointers.set(key, stored);
    return stored;
  }

  get(tenantId: string, runId: string): Readonly<BranchPointer> | undefined {
    return this.pointers.get(pointerKey(tenantId, runId));
  }

  compareAndSwap(
    tenantId: string,
    runId: string,
    branchId: string,
    expectedGeneration: number
  ): Readonly<BranchPointer> {
    const key = pointerKey(tenantId, runId);
    const current = this.pointers.get(key);
    if (current === undefined) throw new ActiveRunNotFoundError(runId);
    if (current.generation !== expectedGeneration) {
      throw new BranchPointerConflictError(expectedGeneration);
    }
    const next = snapshot({
      tenantId,
      runId,
      activeBranchId: branchId,
      generation: current.generation + 1
    });
    this.pointers.set(key, next);
    return next;
  }
}

export class CandidatePromoter {
  constructor(
    private readonly revisions: RevisionBranchReader,
    private readonly pointers: BranchPointerCompareAndSwap
  ) {}

  promote(input: {
    tenantId: string;
    runId: string;
    branchId: string;
    expectedGeneration: number;
    releaseGatePassed: boolean;
  }): Readonly<BranchPointer> {
    if (!input.releaseGatePassed) throw new CandidateReleaseGateError(input.branchId);
    this.requireBranch(input.tenantId, input.runId, input.branchId);
    return this.pointers.compareAndSwap(
      input.tenantId,
      input.runId,
      input.branchId,
      input.expectedGeneration
    );
  }

  rollback(input: {
    tenantId: string;
    runId: string;
    branchId: string;
    expectedGeneration: number;
  }): Readonly<BranchPointer> {
    this.requireBranch(input.tenantId, input.runId, input.branchId);
    return this.pointers.compareAndSwap(
      input.tenantId,
      input.runId,
      input.branchId,
      input.expectedGeneration
    );
  }

  private requireBranch(tenantId: string, runId: string, branchId: string): StoredRevisionBranch {
    const branch = this.revisions.get(tenantId, runId, branchId);
    if (branch === undefined) throw new Error(`candidate branch not found: ${branchId}`);
    return branch;
  }
}
