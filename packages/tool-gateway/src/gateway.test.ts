import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowNode } from "@awf/ir";
import { describe, expect, it, vi } from "vitest";
import { McpToolAdapter, type McpClientPort } from "./adapters.js";
import {
  ToolGateway,
  type ToolAdapter,
  type ToolDefinition,
  type ToolInvocationRequest
} from "./gateway.js";

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "awf-tool-"));
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
    tools: ["search"],
    secretRefs: [],
    ...overrides
  };
}

function definition(adapter: ToolAdapter, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: "search",
    trustLevel: "untrusted",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" } },
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      required: ["items"],
      properties: { items: { type: "array", items: { type: "string" } } },
      additionalProperties: false
    },
    adapter,
    ...overrides
  };
}

async function request(
  overrides: Partial<ToolInvocationRequest> = {}
): Promise<ToolInvocationRequest> {
  return {
    tenantId: "tenant-a",
    runId: "run-a",
    nodeId: "node-a",
    toolId: "search",
    input: { query: "awf" },
    workspaceRoot: await workspace(),
    capabilities: capabilities(),
    ...overrides
  };
}

describe("ToolGateway", () => {
  it("validates schemas and records untrusted output as tainted", async () => {
    const adapter: ToolAdapter = {
      plan: () => ({}),
      invoke: async () => ({ items: ["result"] })
    };
    const gateway = new ToolGateway([definition(adapter)]);
    await expect(gateway.invoke(await request())).resolves.toEqual({
      toolId: "search",
      trustLevel: "untrusted",
      tainted: true,
      output: { items: ["result"] }
    });
  });

  it("rejects unauthorized tools before adapter invocation", async () => {
    const invoke = vi.fn(async () => ({ items: [] }));
    const gateway = new ToolGateway([definition({ plan: () => ({}), invoke })]);
    await expect(
      gateway.invoke(await request({ capabilities: capabilities({ tools: [] }) }))
    ).rejects.toMatchObject({ errorClass: "AUTHORIZATION" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails closed on input schema violation", async () => {
    const invoke = vi.fn(async () => ({ items: [] }));
    const gateway = new ToolGateway([definition({ plan: () => ({}), invoke })]);
    await expect(gateway.invoke(await request({ input: { query: 3 } }))).rejects.toMatchObject({
      errorClass: "VALIDATION"
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("fails closed on tool output schema violation", async () => {
    const gateway = new ToolGateway([
      definition({ plan: () => ({}), invoke: async () => ({ wrong: true }) })
    ]);
    await expect(gateway.invoke(await request())).rejects.toMatchObject({
      errorClass: "VALIDATION"
    });
  });

  it("runs MCP through network and secret capability checks", async () => {
    const callTool = vi.fn(async () => ({ items: ["mcp"] }));
    const client: McpClientPort = { callTool };
    const adapter = new McpToolAdapter(client, {
      serverId: "research",
      toolName: "search",
      endpoint: "https://mcp.example.com/tools",
      secretRefs: ["MCP_TOKEN"]
    });
    const gateway = new ToolGateway([definition(adapter)]);
    await gateway.invoke(
      await request({
        capabilities: capabilities({
          network: ["mcp.example.com"],
          secretRefs: ["MCP_TOKEN"]
        })
      })
    );
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: "research",
        toolName: "search",
        authorizedSecretRefs: ["MCP_TOKEN"]
      })
    );
  });

  it("blocks MCP egress not declared by the node", async () => {
    const callTool = vi.fn(async () => ({ items: [] }));
    const adapter = new McpToolAdapter(
      { callTool },
      {
        serverId: "research",
        toolName: "search",
        endpoint: "https://mcp.example.com/tools"
      }
    );
    const gateway = new ToolGateway([definition(adapter)]);
    await expect(gateway.invoke(await request())).rejects.toMatchObject({
      errorClass: "AUTHORIZATION"
    });
    expect(callTool).not.toHaveBeenCalled();
  });
});
