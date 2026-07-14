import type { WorkflowDefinition, WorkflowNode } from "@awf/ir";
import type { ArtifactMetadata } from "@awf/lineage";
import type { NodeExecutionProfile, RevisionState } from "@awf/impact-engine";
import { createEvidenceBundle, type EvidenceBundle } from "@awf/verifier-sdk";

const brief = { type: "brief", schemaVersion: "1", visibility: "public" as const };
const result = { type: "result", schemaVersion: "1", visibility: "public" as const };

function workflowNode(id: string, input = brief): WorkflowNode {
  return {
    id,
    kind: "deterministic",
    version: "1",
    owner: { id: "builder", role: "builder" },
    inputs: { input },
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
    budget: { maxAttempts: 1, timeoutSec: 60, maxCostUsd: 0.1 },
    cache: { mode: "exact", includeModelRevision: true, includeEnvironmentDigest: true },
    verifiers: [],
    retryPolicy: { retryableClasses: [], backoff: "fixed" }
  };
}

export function fixtureWorkflow(): WorkflowDefinition {
  return {
    apiVersion: "awf/v1",
    id: "control-plane-fixture",
    version: "1",
    mode: "CONTRACT",
    artifactSchemas: [
      { type: "brief", schemaVersion: "1", schema: true },
      { type: "result", schemaVersion: "1", schema: true }
    ],
    inputs: { spec: brief },
    outputs: { result },
    verifierDefinitions: [
      { id: "release", owner: { id: "verifier", role: "verifier" }, visibility: "hidden" }
    ],
    scopePolicy: { maxWorkflowCostUsd: 1, allowedSecrets: [], allowedNetworkHosts: [] },
    nodes: [workflowNode("build"), workflowNode("verify", result)],
    edges: [
      {
        source: { kind: "workflowInput", port: "spec" },
        target: { kind: "nodeInput", nodeId: "build", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "build", port: "output" },
        target: { kind: "nodeInput", nodeId: "verify", port: "input" }
      },
      {
        source: { kind: "nodeOutput", nodeId: "verify", port: "output" },
        target: { kind: "workflowOutput", port: "result" }
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

export function fixtureState(workflow = fixtureWorkflow()): RevisionState {
  return {
    workflow,
    inputArtifactHashes: { spec: "spec-a" },
    contractDigests: { "REQ-1": "contract-a" },
    contractConsumers: { "REQ-1": ["build"] },
    executionProfiles: Object.fromEntries(workflow.nodes.map((node) => [node.id, profile()]))
  };
}

export function fixtureArtifact(input: {
  artifactId: string;
  parentArtifactId?: string;
  createdAt?: string;
  scopeTags?: string[];
}): ArtifactMetadata {
  return {
    artifactId: input.artifactId,
    tenantId: "tenant-a",
    contentHash: `${input.artifactId}-hash`,
    mediaType: "application/json",
    semanticType: "fixture",
    schemaVersion: "1",
    producerNodeId: input.parentArtifactId === undefined ? "build" : "verify",
    producerNodeVersion: "1",
    workflowVersionId: "control-plane-fixture@1",
    runId: "run-a",
    branchId: "main",
    createdAt: input.createdAt ?? "2026-07-01T00:00:00.000Z",
    sizeBytes: 10,
    storageUri: `cas://${input.artifactId}`,
    scopeTags: input.scopeTags ?? [],
    sensitivity: "internal",
    provenance:
      input.parentArtifactId === undefined
        ? []
        : [{ inputArtifactId: input.parentArtifactId, edgeType: "derived" }]
  };
}

const hash = "a".repeat(64);

export function fixtureEvidence(): EvidenceBundle {
  return createEvidenceBundle({
    tenantId: "tenant-a",
    runId: "run-a",
    branchId: "main",
    productArtifactId: "artifact-child",
    verifier: {
      id: "hidden-release",
      version: "1",
      ownerId: "verifier-team",
      visibility: "hidden",
      image: `registry.local/verifier@sha256:${hash}`,
      argv: ["verify"],
      policyDigest: hash,
      requiredEvidenceIds: ["test"]
    },
    startedAt: "2026-07-01T00:00:01.000Z",
    completedAt: "2026-07-01T00:00:02.000Z",
    result: {
      outcome: "failed",
      productContentHash: hash,
      findings: [
        {
          id: "finding-1",
          verifierId: "hidden-release",
          class: "product_defect",
          severity: "blocking",
          reasonCode: "HIDDEN_EXPECTATION",
          evidenceArtifactIds: ["artifact-evidence"],
          affectedPaths: ["src/app.ts"],
          allowedRepairWrites: ["src/app.ts"],
          status: "open"
        }
      ],
      gates: [],
      evidence: [
        {
          id: "test",
          kind: "test_report",
          artifactId: "artifact-evidence",
          contentHash: hash,
          required: true
        }
      ],
      observedWrites: [],
      scopeViolationCount: 0,
      costUsd: 0.01,
      latencyMs: 1000
    }
  });
}
