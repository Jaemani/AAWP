export {
  diffRevisionStates,
  type ChangeReason,
  type ChangeReasonCode,
  type ChangedNodeRoot,
  type ChangedRootSet
} from "./diff.js";
export {
  buildCachePlan,
  explainCachePlan,
  type CachePlan,
  type CachePlanAction,
  type CachePlanReason,
  type CachePlanReasonCode,
  type FingerprintCacheReader,
  type NodeCacheEvidence,
  type NodeCachePlanDecision
} from "./explain.js";
export {
  computeImpact,
  type ImpactDecision,
  type ImpactOptions,
  type ImpactReason,
  type ImpactReasonCode,
  type ImpactResult,
  type ImpactSafetyViolation
} from "./invalidate.js";
export {
  ActiveRunNotFoundError,
  BranchPointerConflictError,
  CandidatePromoter,
  CandidateReleaseGateError,
  InMemoryBranchPointerStore,
  type BranchPointer,
  type BranchPointerCompareAndSwap,
  type RevisionBranchReader
} from "./promotion.js";
export {
  InMemoryRevisionStore,
  RevisionBranchConflictError,
  RevisionParentNotFoundError,
  type NodeExecutionProfile,
  type RevisionBranchSnapshot,
  type RevisionPatch,
  type RevisionState,
  type StoredRevisionBranch
} from "./revision.js";
