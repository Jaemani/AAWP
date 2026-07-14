import { InMemoryFingerprintCache, type FingerprintCacheKey } from "@awf/artifact-store";
import {
  InMemoryRevisionStore,
  buildCachePlan,
  computeImpact,
  diffRevisionStates,
  explainCachePlan,
  type NodeExecutionProfile,
  type RevisionState
} from "@awf/impact-engine";
import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";

const nodeIds = [
  "dependency-install",
  "scaffold",
  "assets",
  "compile-requirements",
  "compile-acceptance",
  "coherent-builder",
  "unit",
  "public-e2e",
  "hidden-e2e",
  "screenshot",
  "a11y",
  "broad-smoke"
] as const;

function node(id: (typeof nodeIds)[number], inputs: string[], output = "output"): WorkflowNode {
  const port = { type: "artifact.generic", schemaVersion: "1", visibility: "public" as const };
  return {
    id,
    kind: id === "coherent-builder" ? "llm" : id.includes("e2e") ? "judge" : "deterministic",
    version: "1",
    owner:
      id === "hidden-e2e" || id === "broad-smoke" || id === "screenshot" || id === "a11y"
        ? { id: "runtime-verifier", role: "verifier" }
        : id === "coherent-builder"
          ? { id: "product-builder", role: "builder" }
          : { id: "runtime", role: "operator" },
    inputs: Object.fromEntries(inputs.map((input) => [input, port])),
    outputs: { [output]: port },
    reads: [],
    writes: [],
    capabilities: {
      filesystemRead: [],
      filesystemWrite: [],
      network: [],
      tools: [],
      secretRefs: []
    },
    budget: { maxAttempts: 1, timeoutSec: 300 },
    cache: { mode: "exact", includeModelRevision: true, includeEnvironmentDigest: true },
    verifiers: [],
    retryPolicy: { retryableClasses: ["CAPACITY"], backoff: "fixed" }
  };
}

function edge(sourceNode: string, targetNode: string, targetPort: string) {
  return {
    source: { kind: "nodeOutput" as const, nodeId: sourceNode, port: "output" },
    target: { kind: "nodeInput" as const, nodeId: targetNode, port: targetPort }
  };
}

export function specToDemoRevisionWorkflow(): WorkflowDefinition {
  const port = { type: "artifact.generic", schemaVersion: "1", visibility: "public" as const };
  const verificationNodes = [
    "unit",
    "public-e2e",
    "hidden-e2e",
    "screenshot",
    "a11y",
    "broad-smoke"
  ];
  return {
    apiVersion: "awf/v1",
    id: "spec-to-demo-revision-benchmark",
    version: "1.0.0",
    mode: "CONTRACT",
    artifactSchemas: [{ type: "artifact.generic", schemaVersion: "1", schema: { type: "object" } }],
    inputs: { spec: port, profile: port },
    outputs: { verdict: port },
    verifierDefinitions: [
      {
        id: "hidden-release",
        owner: { id: "runtime-verifier", role: "verifier" },
        visibility: "hidden"
      }
    ],
    scopePolicy: {},
    nodes: [
      node("dependency-install", ["profile"]),
      node("scaffold", ["profile"]),
      node("assets", ["profile"]),
      node("compile-requirements", ["spec"]),
      node("compile-acceptance", ["requirements"]),
      node("coherent-builder", ["requirements", "scaffold", "dependencies"]),
      node("unit", ["product"]),
      node("public-e2e", ["product"]),
      node("hidden-e2e", ["product", "acceptance"]),
      node("screenshot", ["product"]),
      node("a11y", ["product"]),
      node("broad-smoke", ["product"])
    ],
    edges: [
      {
        source: { kind: "workflowInput", port: "profile" },
        target: { kind: "nodeInput", nodeId: "dependency-install", port: "profile" }
      },
      {
        source: { kind: "workflowInput", port: "profile" },
        target: { kind: "nodeInput", nodeId: "scaffold", port: "profile" }
      },
      {
        source: { kind: "workflowInput", port: "profile" },
        target: { kind: "nodeInput", nodeId: "assets", port: "profile" }
      },
      {
        source: { kind: "workflowInput", port: "spec" },
        target: { kind: "nodeInput", nodeId: "compile-requirements", port: "spec" }
      },
      edge("compile-requirements", "compile-acceptance", "requirements"),
      edge("compile-requirements", "coherent-builder", "requirements"),
      edge("scaffold", "coherent-builder", "scaffold"),
      edge("dependency-install", "coherent-builder", "dependencies"),
      edge("compile-acceptance", "hidden-e2e", "acceptance"),
      ...verificationNodes.map((target) => edge("coherent-builder", target, "product")),
      {
        source: { kind: "nodeOutput", nodeId: "broad-smoke", port: "output" },
        target: { kind: "workflowOutput", port: "verdict" }
      }
    ],
    releasePolicy: { requiredVerifiers: ["hidden-release"], maxBlockingFindings: 0 }
  };
}

function executionProfile(nodeId: string): NodeExecutionProfile {
  return {
    promptTemplateDigest: nodeId === "coherent-builder" ? `prompt-${nodeId}` : null,
    modelDigest: nodeId === "coherent-builder" ? "model-builder" : null,
    toolSchemaDigest: `tool-${nodeId}`,
    environmentImageDigest: `environment-${nodeId}`,
    policyVersion: "policy-v1",
    verifierPolicyDigest: "verifier-v1",
    workspaceBaseTreeHash: "workspace-base-v1"
  };
}

function state(requirementDigest: string): RevisionState {
  return {
    workflow: specToDemoRevisionWorkflow(),
    inputArtifactHashes: { spec: "spec-v1", profile: "react-profile-v1" },
    contractDigests: { "REQ-checkout-confirmation": requirementDigest },
    contractConsumers: { "REQ-checkout-confirmation": ["compile-requirements"] },
    executionProfiles: Object.fromEntries(nodeIds.map((id) => [id, executionProfile(id)]))
  };
}

export interface RevisionBenchmarkResult {
  reusedNodeIds: string[];
  rerunNodeIds: string[];
  explanations: string[];
  parentPreserved: boolean;
}

export function runOneRequirementRevisionBenchmark(): RevisionBenchmarkResult {
  const revisions = new InMemoryRevisionStore();
  const parent = revisions.registerBase({
    revisionId: "revision-main",
    tenantId: "tenant-a",
    runId: "run-a",
    branchId: "main",
    createdAt: "2026-07-14T00:00:00.000Z",
    state: state("confirmation-copy-v1")
  });
  const parentBefore = JSON.stringify(parent);
  const candidate = revisions.createRevision({
    revisionId: "revision-copy-change",
    tenantId: "tenant-a",
    runId: "run-a",
    branchId: "copy-change",
    parentBranchId: "main",
    createdAt: "2026-07-14T00:05:00.000Z",
    patch: { contractDigests: { "REQ-checkout-confirmation": "confirmation-copy-v2" } }
  });
  const changes = diffRevisionStates(parent.state, candidate.state);
  const impact = computeImpact(candidate.state.workflow, changes, {
    broadRegressionNodeIds: ["broad-smoke"]
  });
  const impacted = new Set(
    impact.decisions.filter((decision) => decision.action === "rerun").map((item) => item.nodeId)
  );
  const evidence = Object.fromEntries(
    nodeIds.map((nodeId) => {
      const previousFingerprint = `fingerprint-${nodeId}-v1`;
      const key: FingerprintCacheKey = {
        tenantId: "tenant-a",
        fingerprint: impacted.has(nodeId) ? `fingerprint-${nodeId}-v2` : previousFingerprint,
        verifierPolicyDigest: "verifier-v1",
        sensitivity: "internal"
      };
      return [
        nodeId,
        { previousFingerprint, previousArtifactId: `artifact-${nodeId}-v1`, candidateKey: key }
      ];
    })
  );
  const plan = buildCachePlan(impact, evidence, new InMemoryFingerprintCache());
  return {
    reusedNodeIds: plan.decisions
      .filter((decision) => decision.action === "reuse_parent")
      .map((decision) => decision.nodeId),
    rerunNodeIds: plan.decisions
      .filter((decision) => decision.action === "rerun")
      .map((decision) => decision.nodeId),
    explanations: explainCachePlan(plan),
    parentPreserved: parentBefore === JSON.stringify(revisions.get("tenant-a", "run-a", "main"))
  };
}
