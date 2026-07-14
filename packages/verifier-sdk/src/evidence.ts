import { canonicalize, sha256Hex } from "@awf/ir";
import {
  parseEvidenceBundle,
  parseVerifierDefinition,
  parseVerifierOutput,
  type EvidenceBundle,
  type VerifierDefinition,
  type VerifierOutput
} from "./schema.js";

export interface EvidenceBundleInput {
  tenantId: string;
  runId: string;
  branchId: string;
  productArtifactId: string;
  verifier: VerifierDefinition;
  startedAt: string;
  completedAt: string;
  result: VerifierOutput;
}

export class EvidenceIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceIntegrityError";
  }
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new EvidenceIntegrityError(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function deepFreeze(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function snapshot<T>(value: T): T {
  return deepFreeze(JSON.parse(canonicalize(value)) as T) as T;
}

function assertResultIntegrity(
  verifierId: string,
  requiredEvidenceIds: string[],
  result: VerifierOutput
): void {
  assertUnique(
    result.findings.map((item) => item.id),
    "finding id"
  );
  assertUnique(
    result.gates.map((item) => item.id),
    "gate id"
  );
  assertUnique(
    result.evidence.map((item) => item.id),
    "evidence id"
  );
  assertUnique(requiredEvidenceIds, "required evidence id");

  for (const finding of result.findings) {
    if (finding.verifierId !== verifierId) {
      throw new EvidenceIntegrityError(
        `finding ${finding.id} belongs to verifier ${finding.verifierId}, expected ${verifierId}`
      );
    }
  }
  const evidenceArtifactIds = new Set(result.evidence.map((item) => item.artifactId));
  for (const owner of [...result.findings, ...result.gates]) {
    for (const artifactId of owner.evidenceArtifactIds) {
      if (!evidenceArtifactIds.has(artifactId)) {
        throw new EvidenceIntegrityError(
          `${"reasonCode" in owner ? `finding ${owner.id}` : `gate ${owner.id}`} references missing evidence artifact ${artifactId}`
        );
      }
    }
  }
}

export function createEvidenceBundle(input: EvidenceBundleInput): EvidenceBundle {
  const verifier = parseVerifierDefinition(input.verifier);
  const result = parseVerifierOutput(input.result);
  assertResultIntegrity(verifier.id, verifier.requiredEvidenceIds, result);

  const normalized = {
    schemaVersion: "awf/verifier-evidence/v1" as const,
    tenantId: input.tenantId,
    runId: input.runId,
    branchId: input.branchId,
    productArtifactId: input.productArtifactId,
    verifier: {
      id: verifier.id,
      version: verifier.version,
      ownerId: verifier.ownerId,
      visibility: verifier.visibility,
      image: verifier.image,
      policyDigest: verifier.policyDigest
    },
    requiredEvidenceIds: [...verifier.requiredEvidenceIds].sort(utf16),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    result: {
      ...result,
      findings: [...result.findings].sort((left, right) => utf16(left.id, right.id)),
      gates: [...result.gates].sort((left, right) => utf16(left.id, right.id)),
      evidence: [...result.evidence].sort((left, right) => utf16(left.id, right.id)),
      observedWrites: [...new Set(result.observedWrites)].sort(utf16)
    }
  };
  const bundle = {
    ...normalized,
    bundleId: `evb_${sha256Hex(canonicalize(normalized))}`
  };
  return snapshot(parseEvidenceBundle(bundle));
}

export function verifyEvidenceBundleIntegrity(bundle: EvidenceBundle): EvidenceBundle {
  const parsed = parseEvidenceBundle(bundle);
  assertResultIntegrity(parsed.verifier.id, parsed.requiredEvidenceIds, parsed.result);
  const { bundleId, ...content } = parsed;
  const expected = `evb_${sha256Hex(canonicalize(content))}`;
  if (bundleId !== expected) {
    throw new EvidenceIntegrityError(`evidence bundle digest mismatch: ${bundleId}`);
  }
  return parsed;
}

export function digestEvidenceBundle(bundle: EvidenceBundle): string {
  return sha256Hex(canonicalize(verifyEvidenceBundleIntegrity(bundle)));
}

export function missingRequiredEvidence(bundle: EvidenceBundle): string[] {
  const present = new Set(bundle.result.evidence.map((item) => item.id));
  return bundle.requiredEvidenceIds.filter((id) => !present.has(id)).sort(utf16);
}
