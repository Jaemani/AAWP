import { describe, expect, it } from "vitest";
import {
  InMemoryFingerprintCache,
  calculateNodeFingerprint,
  type FingerprintCacheKey,
  type NodeFingerprintInput
} from "./cache.js";

function fingerprintInput(overrides: Partial<NodeFingerprintInput> = {}): NodeFingerprintInput {
  return {
    nodeDefinition: { id: "build", version: "1" },
    workflowVersionDigest: "workflow-v1",
    inputArtifacts: {
      brief: { contentHash: "a".repeat(64), semanticType: "brief", schemaVersion: "1" }
    },
    promptTemplateDigest: "prompt-v1",
    model: {
      provider: "example",
      name: "model",
      revision: "r1",
      inferenceParameters: { temperature: 0 }
    },
    toolAndSchemaVersions: { compiler: "1" },
    environmentImageDigest: "env-v1",
    policyVersion: "policy-v1",
    secretReferenceIds: ["deploy-token"],
    workspaceBaseTreeHash: "tree-v1",
    verifierPolicyDigest: "verifier-v1",
    ...overrides
  };
}

function key(overrides: Partial<FingerprintCacheKey> = {}): FingerprintCacheKey {
  return {
    tenantId: "tenant-a",
    fingerprint: calculateNodeFingerprint(fingerprintInput()),
    verifierPolicyDigest: "v".repeat(64),
    sensitivity: "internal",
    ...overrides
  };
}

describe("fingerprint cache", () => {
  it("returns an exact cache hit", () => {
    const cache = new InMemoryFingerprintCache();
    const cacheKey = key();
    cache.put({ ...cacheKey, artifactId: "artifact-1", createdAt: "2026-07-14T00:00:00Z" });
    expect(cache.get(cacheKey)?.artifactId).toBe("artifact-1");
  });

  it("misses when the model revision changes", () => {
    const cache = new InMemoryFingerprintCache();
    const first = calculateNodeFingerprint(fingerprintInput());
    const second = calculateNodeFingerprint(
      fingerprintInput({ model: { ...fingerprintInput().model!, revision: "r2" } })
    );
    const storedKey = key({ fingerprint: first });
    cache.put({ ...storedKey, artifactId: "artifact-1", createdAt: "2026-07-14T00:00:00Z" });
    expect(cache.get({ ...storedKey, fingerprint: second })).toBeUndefined();
  });

  it("misses when the environment digest changes", () => {
    const cache = new InMemoryFingerprintCache();
    const storedKey = key();
    cache.put({ ...storedKey, artifactId: "artifact-1", createdAt: "2026-07-14T00:00:00Z" });
    const changed = calculateNodeFingerprint(
      fingerprintInput({ environmentImageDigest: "env-v2" })
    );
    expect(cache.get({ ...storedKey, fingerprint: changed })).toBeUndefined();
  });

  it("misses when verifier policy changes", () => {
    const cache = new InMemoryFingerprintCache();
    const storedKey = key();
    cache.put({ ...storedKey, artifactId: "artifact-1", createdAt: "2026-07-14T00:00:00Z" });
    expect(cache.get({ ...storedKey, verifierPolicyDigest: "x".repeat(64) })).toBeUndefined();
  });

  it("does not return a cross-tenant cache entry", () => {
    const cache = new InMemoryFingerprintCache();
    const storedKey = key();
    cache.put({ ...storedKey, artifactId: "artifact-1", createdAt: "2026-07-14T00:00:00Z" });
    expect(cache.get({ ...storedKey, tenantId: "tenant-b" })).toBeUndefined();
  });
});
