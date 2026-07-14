export {
  authorizeRepair,
  classifyFailure,
  reconcileFindings,
  type FailureSignalKind,
  type FindingReconciliation,
  type RepairActorRole,
  type RepairAuthorization,
  type RepairLane
} from "./classification.js";
export {
  createEvidenceBundle,
  digestEvidenceBundle,
  EvidenceIntegrityError,
  missingRequiredEvidence,
  verifyEvidenceBundleIntegrity,
  type EvidenceBundleInput
} from "./evidence.js";
export {
  evaluateMonotonicCandidate,
  type MonotonicCandidateDecision,
  type MonotonicCandidatePolicy,
  type MonotonicViolation,
  type MonotonicViolationCode
} from "./guard.js";
export {
  VerifiedCandidateEvidenceContextError,
  VerifiedCandidatePromoter,
  VerifiedCandidatePromotionError
} from "./promotion.js";
export {
  EvidenceBundleSchema,
  EvidenceItemSchema,
  FindingClassSchema,
  FindingSchema,
  GateResultSchema,
  parseEvidenceBundle,
  parseVerifierDefinition,
  parseVerifierOutput,
  VerifierDefinitionSchema,
  VerifierOutputSchema,
  VerifierSchemaError,
  type EvidenceBundle,
  type EvidenceItem,
  type Finding,
  type FindingClass,
  type GateResult,
  type VerifierDefinition,
  type VerifierOutput
} from "./schema.js";
