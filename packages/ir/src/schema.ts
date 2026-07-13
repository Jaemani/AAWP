import { Type, type Static, type TSchema } from "@sinclair/typebox";

const owner = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    role: Type.Union([
      Type.Literal("product"),
      Type.Literal("builder"),
      Type.Literal("verifier"),
      Type.Literal("operator")
    ])
  },
  { additionalProperties: false }
);

const artifactRef = Type.Object(
  {
    type: Type.String({ minLength: 1 }),
    schemaVersion: Type.String({ minLength: 1 })
  },
  { additionalProperties: false }
);

const port = Type.Intersect([
  artifactRef,
  Type.Object(
    {
      visibility: Type.Union([Type.Literal("public"), Type.Literal("hidden")])
    },
    { additionalProperties: false }
  )
]);

const artifactSchema = Type.Object(
  {
    type: Type.String({ minLength: 1 }),
    schemaVersion: Type.String({ minLength: 1 }),
    schema: Type.Record(Type.String(), Type.Unknown())
  },
  { additionalProperties: false }
);

const capabilities = Type.Object(
  {
    filesystemRead: Type.Array(Type.String()),
    filesystemWrite: Type.Array(Type.String()),
    network: Type.Array(Type.String()),
    tools: Type.Array(Type.String()),
    secretRefs: Type.Array(Type.String())
  },
  { additionalProperties: false }
);

const budget = Type.Object(
  {
    maxAttempts: Type.Integer({ minimum: 1, maximum: 10 }),
    timeoutSec: Type.Integer({ minimum: 1, maximum: 86400 }),
    maxTokens: Type.Optional(Type.Integer({ minimum: 0 })),
    maxCostUsd: Type.Optional(Type.Number({ minimum: 0 })),
    maxChildren: Type.Optional(Type.Integer({ minimum: 0 }))
  },
  { additionalProperties: false }
);

const cache = Type.Object(
  {
    mode: Type.Union([Type.Literal("disabled"), Type.Literal("exact"), Type.Literal("verified")]),
    includeModelRevision: Type.Boolean(),
    includeEnvironmentDigest: Type.Boolean(),
    ttlSec: Type.Optional(Type.Integer({ minimum: 1 }))
  },
  { additionalProperties: false }
);

const retryPolicy = Type.Object(
  {
    retryableClasses: Type.Array(Type.String()),
    backoff: Type.Union([Type.Literal("fixed"), Type.Literal("exponential")])
  },
  { additionalProperties: false }
);

const verifierBinding = Type.Object(
  {
    verifierId: Type.String({ minLength: 1 }),
    required: Type.Boolean(),
    phase: Type.Union([Type.Literal("pre"), Type.Literal("post"), Type.Literal("release")])
  },
  { additionalProperties: false }
);

const sideEffect = Type.Object(
  {
    operation: Type.String({ minLength: 1 }),
    idempotencyKeyTemplate: Type.Optional(Type.String({ minLength: 1 })),
    compensationNodeId: Type.Optional(Type.String({ minLength: 1 }))
  },
  { additionalProperties: false }
);

const loop = Type.Object(
  {
    maxRounds: Type.Integer({ minimum: 1, maximum: 50 }),
    progressMetric: Type.String({ minLength: 1 }),
    minImprovement: Type.Number({ minimum: 0 })
  },
  { additionalProperties: false }
);

const nodeKind = Type.Union([
  Type.Literal("deterministic"),
  Type.Literal("llm"),
  Type.Literal("tool"),
  Type.Literal("subworkflow"),
  Type.Literal("map"),
  Type.Literal("reduce"),
  Type.Literal("judge"),
  Type.Literal("approval"),
  Type.Literal("wait"),
  Type.Literal("side_effect"),
  Type.Literal("loop")
]);

const endpointSource = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("workflowInput"),
      port: Type.String({ minLength: 1 })
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      kind: Type.Literal("nodeOutput"),
      nodeId: Type.String({ minLength: 1 }),
      port: Type.String({ minLength: 1 })
    },
    { additionalProperties: false }
  )
]);

const endpointTarget = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("nodeInput"),
      nodeId: Type.String({ minLength: 1 }),
      port: Type.String({ minLength: 1 })
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      kind: Type.Literal("workflowOutput"),
      port: Type.String({ minLength: 1 })
    },
    { additionalProperties: false }
  )
]);

export const WorkflowNodeSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    kind: nodeKind,
    version: Type.String({ minLength: 1 }),
    owner: owner,
    inputs: Type.Record(Type.String(), port),
    outputs: Type.Record(Type.String(), port),
    reads: Type.Array(Type.String()),
    writes: Type.Array(Type.String()),
    capabilities: capabilities,
    budget: budget,
    cache: cache,
    verifiers: Type.Array(verifierBinding),
    retryPolicy: retryPolicy,
    sideEffect: Type.Optional(sideEffect),
    loop: Type.Optional(loop)
  },
  { additionalProperties: false }
);

export const WorkflowDefinitionSchema = Type.Object(
  {
    apiVersion: Type.Literal("awf/v1"),
    id: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
    mode: Type.Union([Type.Literal("DIRECT"), Type.Literal("CONTRACT"), Type.Literal("EXPLORER")]),
    artifactSchemas: Type.Array(artifactSchema, { minItems: 1 }),
    inputs: Type.Record(Type.String(), port),
    outputs: Type.Record(Type.String(), port),
    scopePolicy: Type.Record(Type.String(), Type.Unknown()),
    nodes: Type.Array(WorkflowNodeSchema),
    edges: Type.Array(
      Type.Object(
        {
          source: endpointSource,
          target: endpointTarget,
          condition: Type.Optional(Type.String())
        },
        { additionalProperties: false }
      )
    ),
    releasePolicy: Type.Object(
      {
        requiredVerifiers: Type.Array(Type.String()),
        maxBlockingFindings: Type.Integer({ minimum: 0 }),
        requireDirectBaseline: Type.Optional(Type.Boolean())
      },
      { additionalProperties: false }
    )
  },
  { $id: "https://awf.local/schema/wir-v1.json", additionalProperties: false }
);

export type WorkflowDefinition = Static<typeof WorkflowDefinitionSchema>;
export type WorkflowNode = Static<typeof WorkflowNodeSchema>;
export type WorkflowPort = Static<typeof port>;
export type WorkflowEndpointSource = Static<typeof endpointSource>;
export type WorkflowEndpointTarget = Static<typeof endpointTarget>;
export type WorkflowSchema = TSchema;
