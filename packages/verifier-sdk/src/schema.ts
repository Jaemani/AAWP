import { Type, type Static } from "@sinclair/typebox";
import { Ajv2020 } from "ajv/dist/2020.js";

const digest = Type.String({ pattern: "^[a-f0-9]{64}$" });

export const FindingClassSchema = Type.Union([
  Type.Literal("product_defect"),
  Type.Literal("test_contract_defect"),
  Type.Literal("harness_defect"),
  Type.Literal("infra_capacity"),
  Type.Literal("policy_violation"),
  Type.Literal("inconclusive")
]);

export const FindingSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    requirementId: Type.Optional(Type.String({ minLength: 1 })),
    verifierId: Type.String({ minLength: 1 }),
    class: FindingClassSchema,
    severity: Type.Union([
      Type.Literal("blocking"),
      Type.Literal("high"),
      Type.Literal("medium"),
      Type.Literal("low")
    ]),
    reasonCode: Type.String({ minLength: 1 }),
    evidenceArtifactIds: Type.Array(Type.String({ minLength: 1 })),
    affectedPaths: Type.Array(Type.String({ minLength: 1 })),
    allowedRepairWrites: Type.Array(Type.String({ minLength: 1 })),
    status: Type.Union([Type.Literal("open"), Type.Literal("resolved"), Type.Literal("waived")])
  },
  { additionalProperties: false }
);

export const GateResultSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    hard: Type.Boolean(),
    status: Type.Union([
      Type.Literal("passed"),
      Type.Literal("failed"),
      Type.Literal("error"),
      Type.Literal("inconclusive")
    ]),
    evidenceArtifactIds: Type.Array(Type.String({ minLength: 1 }))
  },
  { additionalProperties: false }
);

export const EvidenceItemSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    kind: Type.Union([
      Type.Literal("test_report"),
      Type.Literal("command_log"),
      Type.Literal("screenshot"),
      Type.Literal("accessibility_report"),
      Type.Literal("policy_report"),
      Type.Literal("verifier_log"),
      Type.Literal("other")
    ]),
    artifactId: Type.String({ minLength: 1 }),
    contentHash: digest,
    required: Type.Boolean()
  },
  { additionalProperties: false }
);

export const VerifierDefinitionSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
    ownerId: Type.String({ minLength: 1 }),
    visibility: Type.Union([Type.Literal("public"), Type.Literal("hidden")]),
    image: Type.String({
      pattern: "^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$"
    }),
    argv: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    policyDigest: digest,
    requiredEvidenceIds: Type.Array(Type.String({ minLength: 1 }))
  },
  { additionalProperties: false }
);

export const VerifierOutputSchema = Type.Object(
  {
    outcome: Type.Union([
      Type.Literal("passed"),
      Type.Literal("failed"),
      Type.Literal("error"),
      Type.Literal("inconclusive")
    ]),
    productContentHash: digest,
    findings: Type.Array(FindingSchema),
    gates: Type.Array(GateResultSchema),
    evidence: Type.Array(EvidenceItemSchema),
    observedWrites: Type.Array(Type.String({ minLength: 1 })),
    scopeViolationCount: Type.Integer({ minimum: 0 }),
    costUsd: Type.Number({ minimum: 0 }),
    latencyMs: Type.Integer({ minimum: 0 })
  },
  { additionalProperties: false }
);

export const EvidenceBundleSchema = Type.Object(
  {
    schemaVersion: Type.Literal("awf/verifier-evidence/v1"),
    bundleId: Type.String({ pattern: "^evb_[a-f0-9]{64}$" }),
    tenantId: Type.String({ minLength: 1 }),
    runId: Type.String({ minLength: 1 }),
    branchId: Type.String({ minLength: 1 }),
    productArtifactId: Type.String({ minLength: 1 }),
    verifier: Type.Object(
      {
        id: Type.String({ minLength: 1 }),
        version: Type.String({ minLength: 1 }),
        ownerId: Type.String({ minLength: 1 }),
        visibility: Type.Union([Type.Literal("public"), Type.Literal("hidden")]),
        image: Type.String({
          pattern: "^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$"
        }),
        policyDigest: digest
      },
      { additionalProperties: false }
    ),
    requiredEvidenceIds: Type.Array(Type.String({ minLength: 1 })),
    startedAt: Type.String({ minLength: 1 }),
    completedAt: Type.String({ minLength: 1 }),
    result: VerifierOutputSchema
  },
  { additionalProperties: false }
);

export type FindingClass = Static<typeof FindingClassSchema>;
export type Finding = Static<typeof FindingSchema>;
export type GateResult = Static<typeof GateResultSchema>;
export type EvidenceItem = Static<typeof EvidenceItemSchema>;
export type VerifierDefinition = Static<typeof VerifierDefinitionSchema>;
export type VerifierOutput = Static<typeof VerifierOutputSchema>;
export type EvidenceBundle = Static<typeof EvidenceBundleSchema>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = {
  definition: ajv.compile(VerifierDefinitionSchema),
  output: ajv.compile(VerifierOutputSchema),
  bundle: ajv.compile(EvidenceBundleSchema)
};

export class VerifierSchemaError extends Error {
  constructor(
    readonly schemaName: "definition" | "output" | "bundle",
    readonly validationErrors: ReadonlyArray<string>
  ) {
    super(`invalid verifier ${schemaName}: ${validationErrors.join("; ")}`);
    this.name = "VerifierSchemaError";
  }
}

function parse<T>(
  schemaName: keyof typeof validators,
  input: unknown,
  validate: (value: unknown) => boolean
): T {
  if (!validate(input)) {
    const errors = validators[schemaName].errors?.map(
      (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`
    ) ?? ["unknown validation error"];
    throw new VerifierSchemaError(schemaName, errors);
  }
  return input as T;
}

export function parseVerifierDefinition(input: unknown): VerifierDefinition {
  return parse("definition", input, validators.definition);
}

export function parseVerifierOutput(input: unknown): VerifierOutput {
  return parse("output", input, validators.output);
}

export function parseEvidenceBundle(input: unknown): EvidenceBundle {
  return parse("bundle", input, validators.bundle);
}
