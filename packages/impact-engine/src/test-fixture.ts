import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";
import type { NodeExecutionProfile, RevisionState } from "./revision.js";

const publicBrief = { type: "brief", schemaVersion: "1", visibility: "public" as const };
const publicResult = { type: "result", schemaVersion: "1", visibility: "public" as const };

function node(id: string, input = publicBrief): WorkflowNode {
  return {
    id,
    kind: "deterministic",
    version: "1",
    owner: { id: "builder", role: "builder" },
    inputs: { input },
    outputs: { output: publicResult },
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
    retryPolicy: { retryableClasses: [], backoff: "fixed" }
  };
}

export function fixtureWorkflow(): WorkflowDefinition {
  return {
    apiVersion: "awf/v1",
    id: "impact-fixture",
    version: "1",
    mode: "CONTRACT",
    artifactSchemas: [
      { type: "brief", schemaVersion: "1", schema: true },
      { type: "result", schemaVersion: "1", schema: true }
    ],
    inputs: { spec: publicBrief, assets: publicBrief },
    outputs: { result: publicResult, assets: publicResult },
    verifierDefinitions: [
      { id: "release", owner: { id: "verifier", role: "verifier" }, visibility: "hidden" }
    ],
    scopePolicy: {},
    nodes: [
      node("requirements"),
      node("product", publicResult),
      node("verify", publicResult),
      node("assets")
    ],
    edges: [
      {
        source: { kind: "workflowInput", port: "spec" },
        target: { kind: "nodeInput", nodeId: "requirements", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "requirements", port: "output" },
        target: { kind: "nodeInput", nodeId: "product", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "product", port: "output" },
        target: { kind: "nodeInput", nodeId: "verify", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "verify", port: "output" },
        target: { kind: "workflowOutput", port: "result" }
      },
      {
        source: { kind: "workflowInput", port: "assets" },
        target: { kind: "nodeInput", nodeId: "assets", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "assets", port: "output" },
        target: { kind: "workflowOutput", port: "assets" }
      }
    ],
    releasePolicy: { requiredVerifiers: ["release"], maxBlockingFindings: 0 }
  };
}

function profile(): NodeExecutionProfile {
  return {
    promptTemplateDigest: null,
    modelDigest: null,
    toolSchemaDigest: "tool-v1",
    environmentImageDigest: "env-v1",
    policyVersion: "policy-v1",
    verifierPolicyDigest: "verifier-v1",
    workspaceBaseTreeHash: "tree-v1"
  };
}

export function fixtureState(): RevisionState {
  return {
    workflow: fixtureWorkflow(),
    inputArtifactHashes: { spec: "spec-a", assets: "assets-a" },
    contractDigests: { "REQ-1": "contract-a" },
    contractConsumers: { "REQ-1": ["product"] },
    executionProfiles: Object.fromEntries(
      fixtureWorkflow().nodes.map((item) => [item.id, profile()])
    )
  };
}
