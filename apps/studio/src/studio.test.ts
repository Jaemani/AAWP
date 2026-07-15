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

    expect(html).toContain("AAWP Studio");
    expect(html).toContain("Adaptive Artifact Workflow Platform");
    expect(html).not.toContain("Adaptive Workflow Studio");
    expect(html).toContain("Execute and inspect");
    expect(html).toContain('data-node-id="execute"');
    expect(html).toContain("Run studio-fixture");
    expect(html).toContain("Not executable");
    expect(html).toContain('id="run-workflow" class="run-button" type="button" disabled');
    expect(html).toContain("Run input");
    expect(html).toContain(">Runs<");
    expect(html).toContain("Workflow</strong>");
    expect(html).toContain("Result preview");
    expect(html).toContain("Onboard demo");
    expect(html).toContain("Offboard demo");
    expect(html).toContain("Delete demo");
    expect(html).toContain("Open demo");
    expect(html).toContain("demo-preview");
    expect(html).not.toContain("Delete result");
    expect(html).toContain("demo-frame");
    expect(html).toContain("allow-popups allow-popups-to-escape-sandbox");
    expect(html).toContain("Execution timeline");
    expect(html).toContain("monotonic clock");
    expect(html).toContain("End-to-end time");
    expect(html).toContain("Snapshot");
    expect(html).toContain("Tokens");
    expect(html).toContain("Traceability");
    expect(html).toContain("/api/runs");
    expect(html).toContain("URLSearchParams");
    expect(html).toContain("window.history.replaceState");
    expect(html).toContain('setAttribute("aria-busy"');
    expect(html).toContain('setAttribute("aria-current"');
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).not.toContain("Canonical WIR editor");
    expect(html).not.toContain("Semantic diff");
  });
});
