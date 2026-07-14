import {
  buildCachePlan,
  computeImpact,
  diffRevisionStates,
  type CachePlan,
  type FingerprintCacheReader,
  type ImpactOptions,
  type ImpactResult,
  type NodeCacheEvidence,
  type RevisionState
} from "@awf/impact-engine";
import { semanticDiffWorkflows, type WorkflowSemanticDiff } from "./semantic-diff.js";

export interface RevisionImpactPreview {
  semanticDiff: WorkflowSemanticDiff;
  impact: ImpactResult;
  cachePlan?: CachePlan;
  summary: {
    changedRoots: number;
    removedNodes: number;
    rerunNodes: number;
    reusedNodes: number;
    unsafe: boolean;
  };
}

export function previewRevisionImpact(input: {
  parent: RevisionState;
  candidate: RevisionState;
  options?: ImpactOptions;
  cache?: FingerprintCacheReader;
  cacheEvidenceByNode?: Record<string, NodeCacheEvidence>;
}): RevisionImpactPreview {
  const changes = diffRevisionStates(input.parent, input.candidate);
  const impact = computeImpact(input.candidate.workflow, changes, input.options);
  const cachePlan =
    input.cache !== undefined && input.cacheEvidenceByNode !== undefined
      ? buildCachePlan(impact, input.cacheEvidenceByNode, input.cache)
      : undefined;
  return {
    semanticDiff: semanticDiffWorkflows(input.parent.workflow, input.candidate.workflow),
    impact,
    ...(cachePlan === undefined ? {} : { cachePlan }),
    summary: {
      changedRoots: changes.roots.length,
      removedNodes: changes.removedNodeIds.length,
      rerunNodes: impact.decisions.filter((item) => item.action === "rerun").length,
      reusedNodes: impact.decisions.filter((item) => item.action === "reuse").length,
      unsafe: impact.unsafe
    }
  };
}
