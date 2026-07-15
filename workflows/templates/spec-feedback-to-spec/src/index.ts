export { JsonPointerError, parseJsonPointer, readJsonPointer } from "./pointer.js";
export {
  approveSpecRevision,
  compileSpecFeedbackContract,
  materializeSpecRevisionCandidate,
  SpecRevisionError,
  verifySpecRevision,
  type ApprovedSpecRevision,
  type SpecFeedbackContract,
  type SpecProfileValidator,
  type SpecRevisionApproval,
  type SpecRevisionCandidate,
  type SpecRevisionFinding,
  type SpecRevisionVerdict
} from "./revision.js";
export {
  parseSpecFeedbackIntent,
  parseSpecPatchProposal,
  SpecFeedbackIntentSchema,
  SpecFeedbackSchemaError,
  SpecPatchProposalSchema,
  type FeedbackItem,
  type SpecFeedbackIntent,
  type SpecPatchOperation,
  type SpecPatchProposal
} from "./schema.js";
