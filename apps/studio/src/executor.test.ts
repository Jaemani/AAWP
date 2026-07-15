import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowDefinition } from "@awf/ir";
import {
  LocalProcessWorkflowExecutor,
  parseLocalExecutionManifest,
  StudioExecutionError,
  StudioExecutionManifestError
} from "./executor.js";

const port = { type: "value", schemaVersion: "1", visibility: "public" as const };

function workflow(kind: "deterministic" | "llm" = "deterministic"): WorkflowDefinition {
  return {
    apiVersion: "awf/v1",
    id: "executor-fixture",
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
        kind,
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
}

let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("local process workflow executor", () => {
  it("rejects incomplete manifests and untracked LLM nodes", () => {
    expect(() =>
      parseLocalExecutionManifest(
        {
          schemaVersion: "aawp/local-execution-manifest/v1",
          workflowId: "executor-fixture",
          workingDirectory: "/tmp",
          steps: []
        },
        workflow()
      )
    ).toThrowError(StudioExecutionManifestError);

    expect(() =>
      parseLocalExecutionManifest(
        {
          schemaVersion: "aawp/local-execution-manifest/v1",
          workflowId: "executor-fixture",
          workingDirectory: "/tmp",
          steps: [
            {
              nodeId: "execute",
              command: ["true"],
              timeoutSec: 1,
              tokenTracking: "none",
              outputs: [{ port: "output", source: "stdout" }]
            }
          ]
        },
        workflow("llm")
      )
    ).toThrowError(/must require token tracking/);
  });

  it("executes the registered command and preserves auditable token logs", async () => {
    directory = await mkdtemp(join(tmpdir(), "aawp-executor-"));
    const source = [
      "const fs=require('node:fs')",
      "fs.writeFileSync('artifact.json', JSON.stringify({ok:true,runId:process.env.AAWP_RUN_ID}))",
      "console.log('AAWP_EVENT '+JSON.stringify({type:'model_usage',provider:'fixture',model:'fixture-1',inputTokens:11,cachedInputTokens:3,outputTokens:7,reasoningOutputTokens:2}))"
    ].join(";");
    const definition = workflow("llm");
    const manifest = parseLocalExecutionManifest(
      {
        schemaVersion: "aawp/local-execution-manifest/v1",
        workflowId: definition.id,
        workingDirectory: directory,
        steps: [
          {
            nodeId: "execute",
            command: [process.execPath, "-e", source],
            timeoutSec: 10,
            tokenTracking: "required",
            outputs: [{ port: "output", source: "file", path: "artifact.json" }]
          }
        ]
      },
      definition
    );
    const executor = new LocalProcessWorkflowExecutor(manifest, {
      executionRoot: join(directory, "executions")
    });

    const result = await executor.execute({
      workflow: definition,
      inputs: { input: { message: "hello" } },
      runId: "run_executor_test"
    });

    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      nodeId: "execute",
      exitCode: 0,
      usage: [
        {
          provider: "fixture",
          model: "fixture-1",
          inputTokens: 11,
          cachedInputTokens: 3,
          outputTokens: 7,
          reasoningOutputTokens: 2
        }
      ],
      artifacts: [{ nodeId: "execute", port: "output", source: "file" }]
    });
    await expect(readFile(result.inputPath, "utf8")).resolves.toContain('"message":"hello"');
    await expect(readFile(result.steps[0]!.stdoutPath, "utf8")).resolves.toContain("model_usage");
  });

  it("fails an LLM step when the process does not report usage", async () => {
    directory = await mkdtemp(join(tmpdir(), "aawp-executor-"));
    const definition = workflow("llm");
    const manifest = parseLocalExecutionManifest(
      {
        schemaVersion: "aawp/local-execution-manifest/v1",
        workflowId: definition.id,
        workingDirectory: directory,
        steps: [
          {
            nodeId: "execute",
            command: [process.execPath, "-e", "console.log('done')"],
            timeoutSec: 10,
            tokenTracking: "required",
            outputs: [{ port: "output", source: "stdout" }]
          }
        ]
      },
      definition
    );
    const executor = new LocalProcessWorkflowExecutor(manifest, {
      executionRoot: join(directory, "executions")
    });

    await expect(
      executor.execute({ workflow: definition, inputs: { input: {} }, runId: "run_missing_usage" })
    ).rejects.toMatchObject({
      code: "MODEL_USAGE_MISSING"
    } satisfies Partial<StudioExecutionError>);
  });
});
