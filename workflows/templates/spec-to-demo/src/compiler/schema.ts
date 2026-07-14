import { Type, type Static } from "@sinclair/typebox";
import { Ajv2020 } from "ajv/dist/2020.js";

const SourceSpanSchema = Type.Object(
  {
    start: Type.Integer({ minimum: 0 }),
    end: Type.Integer({ minimum: 0 }),
    lineStart: Type.Integer({ minimum: 1 }),
    lineEnd: Type.Integer({ minimum: 1 })
  },
  { additionalProperties: false }
);

const TriggerSchema = Type.Object(
  {
    operation: Type.Union([
      Type.Literal("visit"),
      Type.Literal("click"),
      Type.Literal("type"),
      Type.Literal("select"),
      Type.Literal("submit")
    ]),
    role: Type.Optional(Type.String({ minLength: 1 })),
    name: Type.Optional(Type.String({ minLength: 1 })),
    value: Type.Optional(Type.String()),
    fixtureRef: Type.Optional(Type.String({ minLength: 1 }))
  },
  { additionalProperties: false }
);

const OracleSchema = Type.Object(
  {
    type: Type.Union([
      Type.Literal("dom"),
      Type.Literal("navigation"),
      Type.Literal("state"),
      Type.Literal("network"),
      Type.Literal("visual"),
      Type.Literal("a11y")
    ]),
    assertion: Type.Record(Type.String(), Type.Unknown())
  },
  { additionalProperties: false }
);

const SpecRequirementSchema = Type.Object(
  {
    key: Type.String({ minLength: 1 }),
    text: Type.String({ minLength: 1 }),
    kind: Type.Union([
      Type.Literal("content"),
      Type.Literal("navigation"),
      Type.Literal("interaction"),
      Type.Literal("state"),
      Type.Literal("visual"),
      Type.Literal("a11y")
    ]),
    sourceSpan: SourceSpanSchema,
    publicCriterion: Type.String({ minLength: 1 }),
    preconditions: Type.Array(Type.Record(Type.String(), Type.Unknown())),
    actions: Type.Array(TriggerSchema),
    oracles: Type.Array(OracleSchema, { minItems: 1 })
  },
  { additionalProperties: false }
);

const SpecScreenSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    route: Type.String({ pattern: "^/" }),
    summary: Type.String({ minLength: 1 }),
    requirements: Type.Array(SpecRequirementSchema, { minItems: 1 })
  },
  { additionalProperties: false }
);

export const SpecDocumentSchema = Type.Object(
  {
    apiVersion: Type.Literal("awf/spec-document/v1"),
    documentId: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    sourceArtifactId: Type.String({ minLength: 1 }),
    screens: Type.Array(SpecScreenSchema, { minItems: 1 })
  },
  { additionalProperties: false }
);

export const SpecToDemoInputSchema = Type.Object(
  {
    specArtifactId: Type.String({ minLength: 1 }),
    selectedScope: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
    demoProfile: Type.Literal("web-react"),
    targetViewports: Type.Array(
      Type.Object(
        {
          width: Type.Integer({ minimum: 320, maximum: 7680 }),
          height: Type.Integer({ minimum: 240, maximum: 4320 })
        },
        { additionalProperties: false }
      ),
      { minItems: 1 }
    ),
    constraints: Type.Optional(
      Type.Object(
        {
          maxScreens: Type.Optional(Type.Integer({ minimum: 1 })),
          forbiddenDependencies: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
          accessibilityLevel: Type.Optional(
            Type.Union([Type.Literal("basic"), Type.Literal("wcag-aa-target")])
          )
        },
        { additionalProperties: false }
      )
    )
  },
  { additionalProperties: false }
);

export type SourceSpan = Static<typeof SourceSpanSchema>;
export type SpecRequirement = Static<typeof SpecRequirementSchema>;
export type SpecScreen = Static<typeof SpecScreenSchema>;
export type SpecDocument = Static<typeof SpecDocumentSchema>;
export type SpecToDemoInput = Static<typeof SpecToDemoInputSchema>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateDocument = ajv.compile(SpecDocumentSchema);
const validateInput = ajv.compile(SpecToDemoInputSchema);

export class SpecSchemaError extends Error {
  constructor(
    readonly schemaName: "document" | "input",
    readonly validationErrors: string[]
  ) {
    super(`invalid spec-to-demo ${schemaName}: ${validationErrors.join("; ")}`);
    this.name = "SpecSchemaError";
  }
}

function validationMessages(
  errors: ReadonlyArray<{ instancePath: string; message?: string }> | null | undefined
): string[] {
  return (
    errors?.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`) ?? [
      "unknown validation error"
    ]
  );
}

export function parseSpecDocument(input: unknown): SpecDocument {
  if (!validateDocument(input)) {
    throw new SpecSchemaError("document", validationMessages(validateDocument.errors));
  }
  return input;
}

export function parseSpecToDemoInput(input: unknown): SpecToDemoInput {
  if (!validateInput(input)) {
    throw new SpecSchemaError("input", validationMessages(validateInput.errors));
  }
  return input;
}
