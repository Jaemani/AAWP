import type { FingerprintCacheEntry, FingerprintCacheKey } from "@awf/artifact-store";
import type { ImpactReason, ImpactResult } from "./invalidate.js";

export type CachePlanAction = "reuse_parent" | "reuse_cache" | "rerun";
export type CachePlanReasonCode =
  | "PARENT_FINGERPRINT_MATCH"
  | "EXACT_CACHE_HIT"
  | "CACHE_MISS"
  | "FINGERPRINT_CHANGED"
  | "CACHE_EVIDENCE_MISSING"
  | "MANDATORY_RERUN"
  | "INVALIDATION_FINGERPRINT_CONTRADICTION";

export interface NodeCacheEvidence {
  previousFingerprint?: string;
  previousArtifactId?: string;
  candidateKey: FingerprintCacheKey;
}

export interface FingerprintCacheReader {
  get(key: FingerprintCacheKey): Readonly<FingerprintCacheEntry> | undefined;
}

export interface CachePlanReason {
  code: CachePlanReasonCode;
  source: string;
}

export interface NodeCachePlanDecision {
  nodeId: string;
  action: CachePlanAction;
  artifactId?: string;
  previousFingerprint?: string;
  candidateFingerprint?: string;
  impactReasons: ImpactReason[];
  cacheReasons: CachePlanReason[];
}

export interface CachePlan {
  decisions: NodeCachePlanDecision[];
  summary: {
    reuseParent: number;
    reuseCache: number;
    rerun: number;
  };
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function missingEvidence(nodeId: string, impactReasons: ImpactReason[]): NodeCachePlanDecision {
  return {
    nodeId,
    action: "rerun",
    impactReasons,
    cacheReasons: [{ code: "CACHE_EVIDENCE_MISSING", source: nodeId }]
  };
}

export function buildCachePlan(
  impact: ImpactResult,
  evidenceByNode: Record<string, NodeCacheEvidence>,
  cache: FingerprintCacheReader
): CachePlan {
  const decisions = impact.decisions.map((decision): NodeCachePlanDecision => {
    const evidence = evidenceByNode[decision.nodeId];
    if (evidence === undefined) return missingEvidence(decision.nodeId, decision.reasons);

    const common = {
      nodeId: decision.nodeId,
      ...(evidence.previousFingerprint === undefined
        ? {}
        : { previousFingerprint: evidence.previousFingerprint }),
      candidateFingerprint: evidence.candidateKey.fingerprint,
      impactReasons: decision.reasons
    };
    if (decision.mandatoryRerun) {
      return {
        ...common,
        action: "rerun",
        cacheReasons: [{ code: "MANDATORY_RERUN", source: decision.nodeId }]
      };
    }
    const fingerprintsMatch =
      evidence.previousFingerprint !== undefined &&
      evidence.previousFingerprint === evidence.candidateKey.fingerprint;
    if (
      decision.action === "reuse" &&
      fingerprintsMatch &&
      evidence.previousArtifactId !== undefined
    ) {
      return {
        ...common,
        action: "reuse_parent",
        artifactId: evidence.previousArtifactId,
        cacheReasons: [{ code: "PARENT_FINGERPRINT_MATCH", source: evidence.previousArtifactId }]
      };
    }
    if (decision.action === "rerun" && fingerprintsMatch) {
      return {
        ...common,
        action: "rerun",
        cacheReasons: [{ code: "INVALIDATION_FINGERPRINT_CONTRADICTION", source: decision.nodeId }]
      };
    }
    const cached = cache.get(evidence.candidateKey);
    if (cached !== undefined) {
      return {
        ...common,
        action: "reuse_cache",
        artifactId: cached.artifactId,
        cacheReasons: [{ code: "EXACT_CACHE_HIT", source: cached.artifactId }]
      };
    }
    return {
      ...common,
      action: "rerun",
      cacheReasons: [
        ...(evidence.previousFingerprint === undefined
          ? []
          : [{ code: "FINGERPRINT_CHANGED", source: evidence.previousFingerprint } as const]),
        { code: "CACHE_MISS", source: evidence.candidateKey.fingerprint }
      ]
    };
  });
  return {
    decisions: decisions.sort((left, right) => utf16(left.nodeId, right.nodeId)),
    summary: {
      reuseParent: decisions.filter((item) => item.action === "reuse_parent").length,
      reuseCache: decisions.filter((item) => item.action === "reuse_cache").length,
      rerun: decisions.filter((item) => item.action === "rerun").length
    }
  };
}

export function explainCachePlan(plan: CachePlan): string[] {
  return plan.decisions.map((decision) => {
    const impact = decision.impactReasons
      .map((reason) => `${reason.code}:${reason.source}`)
      .join(",");
    const cache = decision.cacheReasons
      .map((reason) => `${reason.code}:${reason.source}`)
      .join(",");
    return `${decision.nodeId} ${decision.action} impact=[${impact}] cache=[${cache}]`;
  });
}
