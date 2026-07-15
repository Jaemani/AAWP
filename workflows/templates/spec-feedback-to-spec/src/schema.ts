import { Type, type Static } from "@sinclair/typebox";
import { Ajv2020 } from "ajv/dist/2020.js";

const FeedbackItemSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    text: Type.String({ minLength: 1 }),
    targetPointer: Type.Optional(Type.String({ minLength: 1 })),
    source: Type.Optional(Type.String({ minLength: 1 }))
  },
  { additionalProperties: false }
);

const SpecPatchOperationSchema = Type.Object(
  {
    operation: Type.Union([Type.Literal("add"), Type.Literal("replace"), Type.Literal("remove")]),
    path: Type.String({ minLength: 1 }),
    value: Type.Optional(Type.Unknown()),
    feedbackIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
    reason: Type.String({ minLength: 1 })
  },
  { additionalProperties: false }
);

export const SpecFeedbackIntentSchema = Type.Object(
  {
    schemaVersion: Type.Literal("aawp/spec-feedback-intent/v1"),
    sourceArtifactId: Type.String({ minLength: 1 }),
    sourceDigest: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    requestText: Type.String({ minLength: 1 }),
    feedback: Type.Array(FeedbackItemSchema, { minItems: 1 }),
    authority: Type.Object(
      {
        allowedPathPrefixes: Type.Array(Type.String({ minLength: 1 }), {
          minItems: 1,
          uniqueItems: true
        }),
        allowRemove: Type.Boolean()
      },
      { additionalProperties: false }
    ),
    profile: Type.Object(
      {
        id: Type.String({ minLength: 1 }),
        requiredPointers: Type.Optional(
          Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true })
        )
      },
      { additionalProperties: false }
    )
  },
  { additionalProperties: false }
);

export const SpecPatchProposalSchema = Type.Object(
  {
    schemaVersion: Type.Literal("aawp/spec-patch-proposal/v1"),
    operations: Type.Array(SpecPatchOperationSchema, { minItems: 1 })
  },
  { additionalProperties: false }
);

export type SpecFeedbackIntent = Static<typeof SpecFeedbackIntentSchema>;
export type FeedbackItem = Static<typeof FeedbackItemSchema>;
export type SpecPatchProposal = Static<typeof SpecPatchProposalSchema>;
export type SpecPatchOperation = Static<typeof SpecPatchOperationSchema>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateIntent = ajv.compile(SpecFeedbackIntentSchema);
const validateProposal = ajv.compile(SpecPatchProposalSchema);

export class SpecFeedbackSchemaError extends Error {
  constructor(
    readonly schemaName: "intent" | "proposal",
    readonly validationErrors: string[]
  ) {
    super(`invalid spec-feedback-to-spec ${schemaName}: ${validationErrors.join("; ")}`);
    this.name = "SpecFeedbackSchemaError";
  }
}

function messages(
  errors: ReadonlyArray<{ instancePath: string; message?: string }> | null | undefined
): string[] {
  return (
    errors?.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`) ?? [
      "unknown validation error"
    ]
  );
}

export function parseSpecFeedbackIntent(input: unknown): SpecFeedbackIntent {
  if (!validateIntent(input)) {
    throw new SpecFeedbackSchemaError("intent", messages(validateIntent.errors));
  }
  return input;
}

export function parseSpecPatchProposal(input: unknown): SpecPatchProposal {
  if (!validateProposal(input)) {
    throw new SpecFeedbackSchemaError("proposal", messages(validateProposal.errors));
  }
  return input;
}
