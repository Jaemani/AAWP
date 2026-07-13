import { describe, expect, it } from "vitest";
import { ERROR_CODES, validateWorkflow } from "./index.js";
import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";

const text = { type: "artifact.text", schemaVersion: "1.0.0", visibility: "public" as const };
const report = { type: "artifact.report", schemaVersion: "1.0.0", visibility: "public" as const };
const hidden = { type: "artifact.hidden", schemaVersion: "1.0.0", visibility: "hidden" as const };

function node(id: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    kind: "deterministic",
    version: "1.0.0",
    owner: { id: `${id}-owner`, role: "builder" },
    inputs: { input: text },
    outputs: { output: report },
    reads: ["workspace/input.txt"],
    writes: [`workspace/${id}.txt`],
    capabilities: {
      filesystemRead: ["workspace"],
      filesystemWrite: ["workspace"],
      network: [],
      tools: [],
      secretRefs: []
    },
    budget: { maxAttempts: 1, timeoutSec: 60, maxCostUsd: 0.01 },
    cache: { mode: "exact", includeModelRevision: true, includeEnvironmentDigest: true },
    verifiers: [],
    retryPolicy: { retryableClasses: ["capacity"], backoff: "fixed" },
    ...overrides
  };
}

function validWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  const build = node("build", { owner: { id: "builder-a", role: "builder" } });
  const verify = node("verify-release", {
    kind: "judge",
    owner: { id: "verifier-a", role: "verifier" },
    inputs: { input: report },
    outputs: { output: report },
    reads: [],
    writes: []
  });
  return {
    apiVersion: "awf/v1",
    id: "sample",
    version: "1.0.0",
    mode: "CONTRACT",
    artifactSchemas: [
      { type: "artifact.text", schemaVersion: "1.0.0", schema: { type: "string" } },
      { type: "artifact.report", schemaVersion: "1.0.0", schema: { type: "object" } },
      { type: "artifact.hidden", schemaVersion: "1.0.0", schema: { type: "object" } }
    ],
    inputs: { brief: text },
    outputs: { app: report },
    scopePolicy: { allowedSecrets: [], allowedNetworkHosts: [], maxWorkflowCostUsd: 1 },
    nodes: [build, verify],
    edges: [
      { source: { kind: "workflowInput", port: "brief" }, target: { kind: "nodeInput", nodeId: "build", port: "input" } },
      { source: { kind: "nodeOutput", nodeId: "build", port: "output" }, target: { kind: "nodeInput", nodeId: "verify-release", port: "input" } },
      { source: { kind: "nodeOutput", nodeId: "verify-release", port: "output" }, target: { kind: "workflowOutput", port: "app" } }
    ],
    releasePolicy: { requiredVerifiers: ["verify-release"], maxBlockingFindings: 0 },
    ...overrides
  };
}

function codes(workflow: unknown): string[] {
  return validateWorkflow(workflow).diagnostics.map((item) => item.code);
}

describe("validateWorkflow", () => {
  it("accepts the canonical valid workflow", () => {
    expect(validateWorkflow(validWorkflow()).diagnostics).toEqual([]);
  });

  const cases: Array<[string, string, () => unknown]> = [
    ["schema missing apiVersion", ERROR_CODES.SCHEMA_INVALID, () => ({ ...validWorkflow(), apiVersion: undefined })],
    ["schema invalid mode", ERROR_CODES.SCHEMA_INVALID, () => ({ ...validWorkflow(), mode: "BAD" })],
    ["schema extra root property", ERROR_CODES.SCHEMA_INVALID, () => ({ ...validWorkflow(), extra: true })],
    ["schema bad edge endpoint", ERROR_CODES.SCHEMA_INVALID, () => ({ ...validWorkflow(), edges: [{ source: { kind: "x" }, target: { kind: "y" } }] })],
    ["duplicate node id", ERROR_CODES.DUPLICATE_NODE_ID, () => validWorkflow({ nodes: [node("x"), node("x")] })],
    ["duplicate artifact schema", ERROR_CODES.DUPLICATE_ARTIFACT_SCHEMA, () => validWorkflow({ artifactSchemas: [...validWorkflow().artifactSchemas, { type: "artifact.text", schemaVersion: "1.0.0", schema: {} }] })],
    ["unknown input schema", ERROR_CODES.UNKNOWN_ARTIFACT_SCHEMA, () => validWorkflow({ inputs: { brief: { ...text, type: "missing" } } })],
    ["unknown node schema", ERROR_CODES.UNKNOWN_ARTIFACT_SCHEMA, () => validWorkflow({ nodes: [node("build", { outputs: { output: { ...report, schemaVersion: "9" } } }), validWorkflow().nodes[1]!] })],
    ["unknown source endpoint", ERROR_CODES.UNKNOWN_ENDPOINT, () => validWorkflow({ edges: [{ source: { kind: "nodeOutput", nodeId: "missing", port: "x" }, target: { kind: "workflowOutput", port: "app" } }] })],
    ["unknown target endpoint", ERROR_CODES.UNKNOWN_ENDPOINT, () => validWorkflow({ edges: [{ source: { kind: "workflowInput", port: "brief" }, target: { kind: "nodeInput", nodeId: "missing", port: "x" } }] })],
    ["missing node producer", ERROR_CODES.REQUIRED_INPUT_MISSING_PRODUCER, () => validWorkflow({ edges: validWorkflow().edges.slice(1) })],
    ["missing workflow output producer", ERROR_CODES.WORKFLOW_OUTPUT_MISSING_PRODUCER, () => validWorkflow({ edges: validWorkflow().edges.slice(0, 2) })],
    ["port type mismatch", ERROR_CODES.PORT_TYPE_MISMATCH, () => validWorkflow({ nodes: [node("build", { inputs: { input: report } }), validWorkflow().nodes[1]!] })],
    ["cycle", ERROR_CODES.FORBIDDEN_CYCLE, () => validWorkflow({ nodes: [node("a"), node("b")], edges: [
      { source: { kind: "workflowInput", port: "brief" }, target: { kind: "nodeInput", nodeId: "a", port: "input" } },
      { source: { kind: "nodeOutput", nodeId: "a", port: "output" }, target: { kind: "nodeInput", nodeId: "b", port: "input" } },
      { source: { kind: "nodeOutput", nodeId: "b", port: "output" }, target: { kind: "nodeInput", nodeId: "a", port: "input" } },
      { source: { kind: "nodeOutput", nodeId: "b", port: "output" }, target: { kind: "workflowOutput", port: "app" } }
    ] })],
    ["unbounded loop", ERROR_CODES.UNBOUNDED_LOOP, () => validWorkflow({ nodes: [node("build", { kind: "loop" }), validWorkflow().nodes[1]!] })],
    ["unreachable node warning", ERROR_CODES.UNREACHABLE_NODE, () => validWorkflow({ nodes: [...validWorkflow().nodes, node("orphan")] })],
    ["unreachable output", ERROR_CODES.UNREACHABLE_OUTPUT, () => validWorkflow({ nodes: [node("build"), node("orphan", { outputs: { output: report } })], edges: [
      { source: { kind: "workflowInput", port: "brief" }, target: { kind: "nodeInput", nodeId: "build", port: "input" } },
      { source: { kind: "nodeOutput", nodeId: "orphan", port: "output" }, target: { kind: "workflowOutput", port: "app" } }
    ] })],
    ["write conflict", ERROR_CODES.WRITE_CONFLICT, () => validWorkflow({ nodes: [node("a", { writes: ["workspace/shared.txt"] }), node("b", { writes: ["workspace/shared.txt"] })] })],
    ["undeclared read", ERROR_CODES.UNDECLARED_READ_CAPABILITY, () => validWorkflow({ nodes: [node("build", { reads: ["secret/input"], capabilities: { ...node("build").capabilities, filesystemRead: ["workspace"] } }), validWorkflow().nodes[1]!] })],
    ["undeclared write", ERROR_CODES.UNDECLARED_WRITE_CAPABILITY, () => validWorkflow({ nodes: [node("build", { writes: ["other/out"], capabilities: { ...node("build").capabilities, filesystemWrite: ["workspace"] } }), validWorkflow().nodes[1]!] })],
    ["hidden verifier leakage", ERROR_CODES.HIDDEN_VERIFIER_LEAKAGE, () => validWorkflow({ nodes: [node("build", { inputs: { input: hidden } }), validWorkflow().nodes[1]!] })],
    ["release verifier role", ERROR_CODES.RELEASE_VERIFIER_RULE, () => validWorkflow({ nodes: [node("build"), node("verify-release", { owner: { id: "builder-a", role: "builder" }, inputs: { input: report } })] })],
    ["authority overlap", ERROR_CODES.AUTHORITY_OVERLAP, () => validWorkflow({ nodes: [node("build", { owner: { id: "same", role: "builder" } }), node("verify-release", { owner: { id: "same", role: "verifier" }, inputs: { input: report } })] })],
    ["unknown release verifier", ERROR_CODES.RELEASE_VERIFIER_RULE, () => validWorkflow({ releasePolicy: { requiredVerifiers: ["missing"], maxBlockingFindings: 0 } })],
    ["undeclared secret", ERROR_CODES.UNDECLARED_SECRET, () => validWorkflow({ nodes: [node("build", { capabilities: { ...node("build").capabilities, secretRefs: ["API_KEY"] } }), validWorkflow().nodes[1]!] })],
    ["undeclared network", ERROR_CODES.UNDECLARED_NETWORK, () => validWorkflow({ nodes: [node("build", { capabilities: { ...node("build").capabilities, network: ["api.example.com"] } }), validWorkflow().nodes[1]!] })],
    ["retry bound", ERROR_CODES.RETRY_BOUNDS, () => validWorkflow({ nodes: [node("build", { budget: { ...node("build").budget, maxAttempts: 6 } }), validWorkflow().nodes[1]!] })],
    ["timeout bound", ERROR_CODES.TIMEOUT_BOUNDS, () => validWorkflow({ nodes: [node("build", { budget: { ...node("build").budget, timeoutSec: 3601 } }), validWorkflow().nodes[1]!] })],
    ["side effect guard", ERROR_CODES.SIDE_EFFECT_GUARD_MISSING, () => validWorkflow({ nodes: [node("build", { kind: "side_effect", sideEffect: { operation: "deploy" } }), validWorkflow().nodes[1]!] })],
    ["budget exceeded", ERROR_CODES.BUDGET_EXCEEDED, () => validWorkflow({ scopePolicy: { allowedSecrets: [], allowedNetworkHosts: [], maxWorkflowCostUsd: 0.001 } })],
    ["loop budget exceeded", ERROR_CODES.BUDGET_EXCEEDED, () => validWorkflow({ nodes: [node("build", { kind: "loop", loop: { maxRounds: 5, progressMetric: "score", minImprovement: 0 }, budget: { ...node("build").budget, maxCostUsd: 0.5 } }), validWorkflow().nodes[1]!] })]
  ];

  it.each(cases)("%s emits %s", (_name, expected, makeWorkflow) => {
    expect(codes(makeWorkflow())).toContain(expected);
  });

  it("warnings do not make validation fail", () => {
    const result = validateWorkflow(
      validWorkflow({ nodes: [...validWorkflow().nodes, node("orphan", { inputs: {}, outputs: {} })] })
    );
    expect(result.diagnostics.some((item) => item.severity === "warning")).toBe(true);
    expect(result.ok).toBe(true);
  });
});
