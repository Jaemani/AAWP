import { describe, expect, it } from "vitest";
import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";
import {
  FixtureValidationError,
  SimulationError,
  simulateDeterministic,
  stableTraceJson,
  validateFixtureInput
} from "./index.js";

const brief = { type: "artifact.brief", schemaVersion: "1.0.0", visibility: "public" as const };
const result = { type: "artifact.result", schemaVersion: "1.0.0", visibility: "public" as const };

function node(id: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    kind: "deterministic",
    version: "1.0.0",
    owner: { id: "builder", role: "builder" },
    inputs: { input: brief },
    outputs: { output: result },
    reads: [],
    writes: [],
    capabilities: {
      filesystemRead: [],
      filesystemWrite: [],
      network: [],
      tools: [],
      secretRefs: []
    },
    budget: { maxAttempts: 1, timeoutSec: 60 },
    cache: { mode: "exact", includeModelRevision: true, includeEnvironmentDigest: true },
    verifiers: [],
    retryPolicy: { retryableClasses: [], backoff: "fixed" },
    ...overrides
  };
}

function workflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    apiVersion: "awf/v1",
    id: "runtime-test",
    version: "1.0.0",
    mode: "CONTRACT",
    artifactSchemas: [
      {
        type: "artifact.brief",
        schemaVersion: "1.0.0",
        schema: { type: "object", required: ["title"], properties: { title: { type: "string" } } }
      },
      { type: "artifact.result", schemaVersion: "1.0.0", schema: true }
    ],
    inputs: { brief },
    outputs: { result },
    verifierDefinitions: [
      { id: "release-check", owner: { id: "verifier", role: "verifier" }, visibility: "public" }
    ],
    scopePolicy: { allowedSecrets: [], allowedNetworkHosts: [] },
    nodes: [node("build")],
    edges: [
      {
        source: { kind: "workflowInput", port: "brief" },
        target: { kind: "nodeInput", nodeId: "build", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "build", port: "output" },
        target: { kind: "workflowOutput", port: "result" }
      }
    ],
    releasePolicy: { requiredVerifiers: ["release-check"], maxBlockingFindings: 0 },
    ...overrides
  };
}

describe("runtime-core simulation", () => {
  it("rejects missing, extra, and schema-invalid fixture inputs", () => {
    expect(() => validateFixtureInput(workflow(), {})).toThrow(FixtureValidationError);
    expect(() => validateFixtureInput(workflow(), { brief: { title: "ok" }, extra: true })).toThrow(
      FixtureValidationError
    );
    expect(() => validateFixtureInput(workflow(), { brief: { title: 1 } })).toThrow(
      FixtureValidationError
    );
  });

  it("keeps trace stable when node and edge arrays are reordered", () => {
    const a = node("a");
    const b = node("b", { inputs: { input: result } });
    const edges: WorkflowDefinition["edges"] = [
      {
        source: { kind: "workflowInput", port: "brief" },
        target: { kind: "nodeInput", nodeId: "a", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "a", port: "output" },
        target: { kind: "nodeInput", nodeId: "b", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "b", port: "output" },
        target: { kind: "workflowOutput", port: "result" }
      }
    ];
    const first = workflow({ nodes: [a, b], edges });
    const second = workflow({ nodes: [b, a], edges: [...edges].reverse() });

    const fixture = { brief: { title: "stable" } };
    expect(stableTraceJson(simulateDeterministic(first, fixture))).toBe(
      stableTraceJson(simulateDeterministic(second, fixture))
    );
  });

  it("throws structured simulation errors for stalled execution and missing output", () => {
    expect(() =>
      simulateDeterministic(
        workflow({
          nodes: [node("blocked", { inputs: { input: result } })],
          edges: [
            {
              source: { kind: "nodeOutput", nodeId: "missing", port: "output" },
              target: { kind: "nodeInput", nodeId: "blocked", port: "input" }
            },
            {
              source: { kind: "nodeOutput", nodeId: "blocked", port: "output" },
              target: { kind: "workflowOutput", port: "result" }
            }
          ]
        }),
        { brief: { title: "x" } }
      )
    ).toThrow(SimulationError);

    expect(() =>
      simulateDeterministic(
        workflow({
          edges: [
            {
              source: { kind: "workflowInput", port: "brief" },
              target: { kind: "nodeInput", nodeId: "build", port: "input" }
            }
          ]
        }),
        {
          brief: { title: "x" }
        }
      )
    ).toThrow(SimulationError);
  });

  it("preserves sideEffectSkipped events without executing side effects", () => {
    const trace = simulateDeterministic(
      workflow({
        nodes: [
          node("deploy", {
            kind: "side_effect",
            sideEffect: { operation: "deploy", idempotencyKeyTemplate: "deploy-1" }
          })
        ],
        edges: [
          {
            source: { kind: "workflowInput", port: "brief" },
            target: { kind: "nodeInput", nodeId: "deploy", port: "input" }
          },
          {
            source: { kind: "nodeOutput", nodeId: "deploy", port: "output" },
            target: { kind: "workflowOutput", port: "result" }
          }
        ]
      }),
      { brief: { title: "deploy" } }
    );
    expect(trace.events).toContainEqual({
      type: "sideEffectSkipped",
      nodeId: "deploy",
      operation: "deploy"
    });
  });
});
