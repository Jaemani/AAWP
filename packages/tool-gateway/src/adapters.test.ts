import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowNode } from "@awf/ir";
import type { SecretBroker } from "@awf/policy";
import { describe, expect, it } from "vitest";
import { CliToolAdapter } from "./adapters.js";
import { ToolGateway, type ToolDefinition } from "./gateway.js";
import { SandboxLauncher, type IsolatedSandboxSpec, type SandboxBackend } from "./sandbox.js";

const image = `registry.example/awf/cli@sha256:${"b".repeat(64)}`;

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "awf-cli-"));
  await mkdir(join(root, "workspace"), { recursive: true });
  return root;
}

function capabilities(
  overrides: Partial<WorkflowNode["capabilities"]> = {}
): WorkflowNode["capabilities"] {
  return {
    filesystemRead: [],
    filesystemWrite: [],
    network: [],
    tools: ["cli.transform"],
    secretRefs: [],
    ...overrides
  };
}

function definition(adapter: CliToolAdapter): ToolDefinition {
  return {
    id: "cli.transform",
    trustLevel: "restricted",
    inputSchema: { type: "object" },
    outputSchema: {
      type: "object",
      required: ["ok"],
      properties: { ok: { type: "boolean" } },
      additionalProperties: false
    },
    adapter
  };
}

describe("CLI tool adapter", () => {
  it("uses argv and JSON stdin without constructing a shell command", async () => {
    const specs: IsolatedSandboxSpec[] = [];
    const backend: SandboxBackend = {
      run: async (spec) => {
        specs.push(spec);
        return { exitCode: 0, stdout: '{"ok":true}', stderr: "" };
      }
    };
    const adapter = new CliToolAdapter(new SandboxLauncher(backend), {
      image,
      argv: ["transform", "--json"]
    });
    const gateway = new ToolGateway([definition(adapter)]);
    await expect(
      gateway.invoke({
        tenantId: "tenant-a",
        runId: "run-a",
        nodeId: "node-a",
        toolId: "cli.transform",
        input: { value: "$(must-not-run)" },
        workspaceRoot: await workspace(),
        capabilities: capabilities()
      })
    ).resolves.toMatchObject({ output: { ok: true }, trustLevel: "restricted" });
    expect(specs[0]?.argv).toEqual(["transform", "--json"]);
    expect(specs[0]?.stdin).toBe('{"value":"$(must-not-run)"}');
  });

  it("redacts brokered secrets from CLI failure messages", async () => {
    const broker: SecretBroker = {
      issue: async (request) => ({
        reference: request.reference,
        environmentVariable: "TOOL_TOKEN",
        value: "sensitive-token",
        expiresAt: Date.now() + 60_000
      })
    };
    const backend: SandboxBackend = {
      run: async () => ({
        exitCode: 7,
        stdout: "",
        stderr: "remote rejected sensitive-token"
      })
    };
    const adapter = new CliToolAdapter(new SandboxLauncher(backend, broker), {
      image,
      argv: ["transform"],
      capabilities: { secretRefs: ["TOOL_TOKEN"] }
    });
    const gateway = new ToolGateway([definition(adapter)]);
    let thrown: unknown;
    try {
      await gateway.invoke({
        tenantId: "tenant-a",
        runId: "run-a",
        nodeId: "node-a",
        toolId: "cli.transform",
        input: {},
        workspaceRoot: await workspace(),
        capabilities: capabilities({ secretRefs: ["TOOL_TOKEN"] })
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ errorClass: "TOOL_EXECUTION" });
    expect(String((thrown as Error).message)).toContain("[REDACTED]");
    expect(String((thrown as Error).message)).not.toContain("sensitive-token");
  });

  it("rejects malformed CLI JSON before output schema validation", async () => {
    const backend: SandboxBackend = {
      run: async () => ({ exitCode: 0, stdout: "{", stderr: "" })
    };
    const adapter = new CliToolAdapter(new SandboxLauncher(backend), {
      image,
      argv: ["transform"]
    });
    const gateway = new ToolGateway([definition(adapter)]);
    await expect(
      gateway.invoke({
        tenantId: "tenant-a",
        runId: "run-a",
        nodeId: "node-a",
        toolId: "cli.transform",
        input: {},
        workspaceRoot: await workspace(),
        capabilities: capabilities()
      })
    ).rejects.toMatchObject({ errorClass: "VALIDATION" });
  });
});
