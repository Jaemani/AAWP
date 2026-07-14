import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createWorkflowEditorDocument } from "@awf/control-plane";
import type { WorkflowDefinition } from "@awf/ir";
import { createStudioServer } from "./server.js";

const port = { type: "value", schemaVersion: "1", visibility: "public" as const };
const workflow: WorkflowDefinition = {
  apiVersion: "awf/v1",
  id: "server-fixture",
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

let server: Server | undefined;

afterEach(async () => {
  if (server !== undefined) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe("Studio local server", () => {
  it("serves a read-only source and compiler-backed candidate check", async () => {
    const document = createWorkflowEditorDocument(workflow);
    server = createStudioServer({ document });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const source = await fetch(`${base}/api/workflow`).then(async (response) => response.json());
    expect(source).toMatchObject({ digest: document.digest });

    const valid = await fetch(`${base}/api/check`, {
      method: "POST",
      body: document.canonicalJson
    }).then(async (response) => response.json());
    expect(valid).toEqual({
      ok: true,
      digest: document.digest,
      canonicalJson: document.canonicalJson
    });

    const invalidResponse = await fetch(`${base}/api/check`, { method: "POST", body: "{}" });
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({ ok: false });
  });
});
