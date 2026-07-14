import type { CapabilityAuthorizer } from "@awf/policy";
import { SandboxLauncher, type SandboxLimits } from "@awf/tool-gateway";
import {
  createEvidenceBundle,
  parseVerifierDefinition,
  parseVerifierOutput,
  type EvidenceBundle,
  type FindingClass,
  type VerifierDefinition,
  type VerifierOutput
} from "@awf/verifier-sdk";

export interface VerifierWorkerClock {
  now(): Date;
}

export interface VerifierRunRequest {
  tenantId: string;
  runId: string;
  branchId: string;
  nodeId: string;
  productArtifactId: string;
  productContentHash: string;
  productWorkspacePath: string;
  evidenceWorkspacePath: string;
  definition: VerifierDefinition;
  authorizer: CapabilityAuthorizer;
  limits?: Partial<SandboxLimits>;
}

export class VerifierMountConflictError extends Error {
  constructor(productPath: string, evidencePath: string) {
    super(`product and evidence mounts overlap: ${productPath}, ${evidencePath}`);
    this.name = "VerifierMountConflictError";
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function failureOutput(input: {
  verifierId: string;
  productContentHash: string;
  class: FindingClass;
  reasonCode: string;
  latencyMs: number;
}): VerifierOutput {
  return {
    outcome: input.class === "inconclusive" ? "inconclusive" : "error",
    productContentHash: input.productContentHash,
    findings: [
      {
        id: `${input.verifierId}:worker:${input.reasonCode.toLowerCase()}`,
        verifierId: input.verifierId,
        class: input.class,
        severity: "blocking",
        reasonCode: input.reasonCode,
        evidenceArtifactIds: [],
        affectedPaths: [],
        allowedRepairWrites: [],
        status: "open"
      }
    ],
    gates: [],
    evidence: [],
    observedWrites: [],
    scopeViolationCount: input.class === "policy_violation" ? 1 : 0,
    costUsd: 0,
    latencyMs: input.latencyMs
  };
}

function decodeOutput(
  stdout: string,
  exitCode: number,
  verifierId: string,
  productContentHash: string,
  latencyMs: number
): VerifierOutput {
  let parsed: VerifierOutput;
  try {
    parsed = parseVerifierOutput(JSON.parse(stdout));
  } catch {
    return failureOutput({
      verifierId,
      productContentHash,
      class: "harness_defect",
      reasonCode: exitCode === 0 ? "INVALID_VERIFIER_OUTPUT" : "VERIFIER_PROCESS_FAILED",
      latencyMs
    });
  }
  if (parsed.productContentHash !== productContentHash) {
    return failureOutput({
      verifierId,
      productContentHash,
      class: "policy_violation",
      reasonCode: "PRODUCT_HASH_MISMATCH",
      latencyMs
    });
  }
  if (exitCode !== 0 && parsed.outcome === "passed") {
    return failureOutput({
      verifierId,
      productContentHash,
      class: "harness_defect",
      reasonCode: "PASS_WITH_NONZERO_EXIT",
      latencyMs
    });
  }
  return { ...parsed, latencyMs };
}

export class VerifierWorker {
  constructor(
    private readonly launcher: SandboxLauncher,
    private readonly clock: VerifierWorkerClock = { now: () => new Date() }
  ) {}

  async run(request: VerifierRunRequest, signal: AbortSignal): Promise<EvidenceBundle> {
    const definition = parseVerifierDefinition(request.definition);
    if (pathsOverlap(request.productWorkspacePath, request.evidenceWorkspacePath)) {
      throw new VerifierMountConflictError(
        request.productWorkspacePath,
        request.evidenceWorkspacePath
      );
    }
    const started = this.clock.now();
    const result = await this.launcher.run(
      {
        tenantId: request.tenantId,
        runId: request.runId,
        nodeId: request.nodeId,
        authorizer: request.authorizer,
        image: definition.image,
        argv: definition.argv,
        stdin: JSON.stringify({
          productPath: `/workspace/${request.productWorkspacePath}`,
          evidencePath: `/workspace/${request.evidenceWorkspacePath}`,
          productArtifactId: request.productArtifactId,
          productContentHash: request.productContentHash,
          branchId: request.branchId
        }),
        filesystemRead: [request.productWorkspacePath],
        filesystemWrite: [request.evidenceWorkspacePath],
        ...(request.limits === undefined ? {} : { limits: request.limits })
      },
      signal
    );
    const completed = this.clock.now();
    const latencyMs = Math.max(0, completed.getTime() - started.getTime());
    return createEvidenceBundle({
      tenantId: request.tenantId,
      runId: request.runId,
      branchId: request.branchId,
      productArtifactId: request.productArtifactId,
      verifier: definition,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      result: decodeOutput(
        result.stdout,
        result.exitCode,
        definition.id,
        request.productContentHash,
        latencyMs
      )
    });
  }
}
