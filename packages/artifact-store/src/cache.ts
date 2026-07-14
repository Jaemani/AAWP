import { digestWorkflow } from "@awf/ir";

export type ArtifactSensitivity = "public" | "internal" | "confidential" | "restricted";

export interface NodeFingerprintInput {
  nodeDefinition: unknown;
  workflowVersionDigest: string;
  inputArtifacts: Record<
    string,
    { contentHash: string; semanticType: string; schemaVersion: string }
  >;
  promptTemplateDigest: string | null;
  model: {
    provider: string;
    name: string;
    revision: string;
    inferenceParameters: Record<string, unknown>;
  } | null;
  toolAndSchemaVersions: Record<string, string>;
  environmentImageDigest: string;
  policyVersion: string;
  secretReferenceIds: string[];
  workspaceBaseTreeHash: string;
  verifierPolicyDigest: string;
}

export function calculateNodeFingerprint(input: NodeFingerprintInput): string {
  return digestWorkflow({
    ...input,
    secretReferenceIds: [...input.secretReferenceIds].sort()
  });
}

export interface FingerprintCacheKey {
  tenantId: string;
  fingerprint: string;
  verifierPolicyDigest: string;
  sensitivity: ArtifactSensitivity;
}

export interface FingerprintCacheEntry extends FingerprintCacheKey {
  artifactId: string;
  createdAt: string;
}

export class CacheEntryConflictError extends Error {
  constructor(readonly key: FingerprintCacheKey) {
    super("fingerprint cache key already points to a different artifact");
    this.name = "CacheEntryConflictError";
  }
}

function cacheKey(key: FingerprintCacheKey): string {
  return [key.tenantId, key.fingerprint, key.verifierPolicyDigest, key.sensitivity].join("\0");
}

function snapshot(entry: FingerprintCacheEntry): Readonly<FingerprintCacheEntry> {
  return Object.freeze({ ...entry });
}

export class InMemoryFingerprintCache {
  private readonly entries = new Map<string, Readonly<FingerprintCacheEntry>>();

  put(entry: FingerprintCacheEntry): Readonly<FingerprintCacheEntry> {
    const key = cacheKey(entry);
    const existing = this.entries.get(key);
    if (existing !== undefined && existing.artifactId !== entry.artifactId) {
      throw new CacheEntryConflictError(entry);
    }
    if (existing !== undefined) return existing;
    const stored = snapshot(entry);
    this.entries.set(key, stored);
    return stored;
  }

  get(key: FingerprintCacheKey): Readonly<FingerprintCacheEntry> | undefined {
    return this.entries.get(cacheKey(key));
  }
}
