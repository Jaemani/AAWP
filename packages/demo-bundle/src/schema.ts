import { Type, type Static } from "@sinclair/typebox";
import { Ajv2020 } from "ajv/dist/2020.js";

const ScreenIdArraySchema = Type.Array(Type.String({ minLength: 1 }), {
  minItems: 1,
  uniqueItems: true
});

const DemoBundleSourceSchema = Type.Object(
  {
    artifactId: Type.String({ minLength: 1 }),
    contentDigest: Type.String({ pattern: "^[a-f0-9]{64}$" })
  },
  { additionalProperties: false }
);

const DemoBundleGroupSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    kind: Type.Union([Type.Literal("topic"), Type.Literal("flow")]),
    screenIds: ScreenIdArraySchema
  },
  { additionalProperties: false }
);

const DemoBundleSurfaceSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    formFactor: Type.Union([
      Type.Literal("web"),
      Type.Literal("mobile"),
      Type.Literal("tablet"),
      Type.Literal("other")
    ]),
    actorLabel: Type.Optional(Type.String({ minLength: 1 })),
    screenIds: ScreenIdArraySchema
  },
  { additionalProperties: false }
);

const DemoBundleScreenSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    route: Type.String({ pattern: "^/" }),
    surfaceId: Type.String({ minLength: 1 }),
    groupIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
    artifactPath: Type.String({ minLength: 1 })
  },
  { additionalProperties: false }
);

const DemoBundleDefinitionSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String({ minLength: 1 })),
    groupIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
    screenIds: ScreenIdArraySchema
  },
  { additionalProperties: false }
);

export const DemoBundleManifestDraftSchema = Type.Object(
  {
    schemaVersion: Type.Literal("aawp/demo-bundle/v1"),
    manifestId: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    requestText: Type.Optional(Type.String({ minLength: 1 })),
    source: DemoBundleSourceSchema,
    bundles: Type.Array(DemoBundleDefinitionSchema, { minItems: 1 }),
    surfaces: Type.Array(DemoBundleSurfaceSchema, { minItems: 1 }),
    groups: Type.Array(DemoBundleGroupSchema, { minItems: 1 }),
    screens: Type.Array(DemoBundleScreenSchema, { minItems: 1 })
  },
  { additionalProperties: false }
);

export type DemoBundleManifestDraft = Static<typeof DemoBundleManifestDraftSchema>;
export type DemoBundleDefinition = Static<typeof DemoBundleDefinitionSchema>;
export type DemoBundleSurface = Static<typeof DemoBundleSurfaceSchema>;
export type DemoBundleGroup = Static<typeof DemoBundleGroupSchema>;
export type DemoBundleScreen = Static<typeof DemoBundleScreenSchema>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateDraft = ajv.compile(DemoBundleManifestDraftSchema);

export class DemoBundleSchemaError extends Error {
  constructor(readonly validationErrors: string[]) {
    super(`invalid demo bundle manifest: ${validationErrors.join("; ")}`);
    this.name = "DemoBundleSchemaError";
  }
}

export function parseDemoBundleManifestDraft(input: unknown): DemoBundleManifestDraft {
  if (!validateDraft(input)) {
    throw new DemoBundleSchemaError(
      validateDraft.errors?.map(
        (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`
      ) ?? ["unknown validation error"]
    );
  }
  return input;
}
