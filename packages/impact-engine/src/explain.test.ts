import { InMemoryFingerprintCache, type FingerprintCacheKey } from "@awf/artifact-store";
import { describe, expect, it } from "vitest";
import { buildCachePlan, explainCachePlan, type NodeCacheEvidence } from "./explain.js";
import type { ImpactResult } from "./invalidate.js";

function key(fingerprint: string, verifierPolicyDigest = "v".repeat(64)): FingerprintCacheKey {
  return {
    tenantId: "tenant-a",
    fingerprint,
    verifierPolicyDigest,
    sensitivity: "internal"
  };
}

describe("explainable cache plan", () => {
  it("distinguishes parent reuse, exact cache reuse and mandatory rerun", () => {
    const cache = new InMemoryFingerprintCache();
    const parentFingerprint = "a".repeat(64);
    const cachedFingerprint = "b".repeat(64);
    const mandatoryFingerprint = "c".repeat(64);
    cache.put({
      ...key(cachedFingerprint),
      artifactId: "artifact-cache",
      createdAt: "2026-07-14T00:00:00.000Z"
    });
    cache.put({
      ...key(mandatoryFingerprint),
      artifactId: "artifact-mandatory-cache",
      createdAt: "2026-07-14T00:00:00.000Z"
    });
    const impact: ImpactResult = {
      decisions: [
        { nodeId: "assets", action: "reuse", mandatoryRerun: false, reasons: [] },
        {
          nodeId: "product",
          action: "rerun",
          mandatoryRerun: false,
          reasons: [{ code: "CONTRACT_CHANGED", source: "REQ-1" }]
        },
        {
          nodeId: "verify",
          action: "rerun",
          mandatoryRerun: true,
          reasons: [{ code: "BROAD_REGRESSION", source: "verify" }]
        }
      ],
      removedNodeIds: [],
      workflowReasons: [],
      safetyViolations: [],
      unsafe: false
    };
    const evidence: Record<string, NodeCacheEvidence> = {
      assets: {
        previousFingerprint: parentFingerprint,
        previousArtifactId: "artifact-parent",
        candidateKey: key(parentFingerprint)
      },
      product: {
        previousFingerprint: "d".repeat(64),
        previousArtifactId: "artifact-old-product",
        candidateKey: key(cachedFingerprint)
      },
      verify: {
        previousFingerprint: "e".repeat(64),
        previousArtifactId: "artifact-old-verify",
        candidateKey: key(mandatoryFingerprint)
      }
    };
    const plan = buildCachePlan(impact, evidence, cache);
    expect(plan.decisions.map((item) => [item.nodeId, item.action, item.artifactId])).toEqual([
      ["assets", "reuse_parent", "artifact-parent"],
      ["product", "reuse_cache", "artifact-cache"],
      ["verify", "rerun", undefined]
    ]);
    expect(plan.summary).toEqual({ reuseParent: 1, reuseCache: 1, rerun: 1 });
    expect(explainCachePlan(plan)[1]).toContain("EXACT_CACHE_HIT:artifact-cache");
  });

  it("misses cache entries with a different verifier policy", () => {
    const cache = new InMemoryFingerprintCache();
    const fingerprint = "f".repeat(64);
    cache.put({
      ...key(fingerprint, "1".repeat(64)),
      artifactId: "artifact-wrong-verifier",
      createdAt: "2026-07-14T00:00:00.000Z"
    });
    const impact: ImpactResult = {
      decisions: [
        {
          nodeId: "verify",
          action: "rerun",
          mandatoryRerun: false,
          reasons: [{ code: "VERIFIER_CHANGED", source: "verifierPolicyDigest" }]
        }
      ],
      removedNodeIds: [],
      workflowReasons: [],
      safetyViolations: [],
      unsafe: false
    };
    const plan = buildCachePlan(
      impact,
      {
        verify: {
          previousFingerprint: "0".repeat(64),
          candidateKey: key(fingerprint, "2".repeat(64))
        }
      },
      cache
    );
    expect(plan.decisions[0]).toMatchObject({
      action: "rerun",
      cacheReasons: [
        { code: "FINGERPRINT_CHANGED", source: "0".repeat(64) },
        { code: "CACHE_MISS", source: fingerprint }
      ]
    });
  });

  it("fails safe when invalidation and an unchanged fingerprint contradict", () => {
    const fingerprint = "9".repeat(64);
    const plan = buildCachePlan(
      {
        decisions: [
          {
            nodeId: "product",
            action: "rerun",
            mandatoryRerun: false,
            reasons: [{ code: "POLICY_CHANGED", source: "policyVersion" }]
          }
        ],
        removedNodeIds: [],
        workflowReasons: [],
        safetyViolations: [],
        unsafe: false
      },
      {
        product: {
          previousFingerprint: fingerprint,
          previousArtifactId: "artifact-old",
          candidateKey: key(fingerprint)
        }
      },
      new InMemoryFingerprintCache()
    );
    expect(plan.decisions[0]).toMatchObject({
      action: "rerun",
      cacheReasons: [{ code: "INVALIDATION_FINGERPRINT_CONTRADICTION", source: "product" }]
    });
  });
});
