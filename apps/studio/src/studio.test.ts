import { describe, expect, it } from "vitest";
import { createWorkflowEditorDocument } from "@awf/control-plane";
import type { WorkflowDefinition } from "@awf/ir";
import { createStudioView, renderStudioHtml } from "./studio.js";

const port = { type: "value", schemaVersion: "1", visibility: "public" as const };
const workflow: WorkflowDefinition = {
  apiVersion: "awf/v1",
  id: "studio-fixture",
  version: "1",
  mode: "DIRECT",
  artifactSchemas: [{ type: "value", schemaVersion: "1", schema: true }],
  inputs: { input: port },
  outputs: { output: port },
  verifierDefinitions: [],
  scopePolicy: {},
  nodes: [
    {
      id: "execute",
      kind: "deterministic",
      version: "1",
      owner: { id: "operator", role: "operator" },
      inputs: { input: port },
      outputs: { output: port },
      reads: [],
      writes: [],
      capabilities: {
        filesystemRead: [],
        filesystemWrite: [],
        network: [],
        tools: [],
        secretRefs: []
      },
      budget: { maxAttempts: 1, timeoutSec: 30 },
      cache: { mode: "exact", includeModelRevision: true, includeEnvironmentDigest: true },
      verifiers: [],
      retryPolicy: { retryableClasses: [], backoff: "fixed" }
    }
  ],
  edges: [
    {
      source: { kind: "workflowInput", port: "input" },
      target: { kind: "nodeInput", nodeId: "execute", port: "input" }
    },
    {
      source: { kind: "nodeOutput", nodeId: "execute", port: "output" },
      target: { kind: "workflowOutput", port: "output" }
    }
  ],
  releasePolicy: { requiredVerifiers: [], maxBlockingFindings: 0 }
};

describe("Studio HTML", () => {
  it("renders one run action with history and run details", () => {
    const document = createWorkflowEditorDocument(workflow);
    const html = renderStudioHtml(createStudioView({ document }));

    expect(html).toContain("Workflow runs");
    expect(html).toContain('data-node-id="execute"');
    expect(html).toContain("Run workflow");
    expect(html).toContain("Run history");
    expect(html).toContain("Event timeline");
    expect(html).toContain("/api/runs");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain("Canonical WIR editor");
    expect(html).not.toContain("Semantic diff");
  });
});
