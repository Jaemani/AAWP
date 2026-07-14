import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowNode } from "@awf/ir";
import { CapabilityAuthorizer, type SecretBroker } from "@awf/policy";
import { describe, expect, it } from "vitest";
import { SandboxLauncher, type IsolatedSandboxSpec, type SandboxBackend } from "./sandbox.js";

const image = `registry.example/awf/tool@sha256:${"a".repeat(64)}`;

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "awf-sandbox-"));
  await mkdir(join(root, "workspace"), { recursive: true });
  await writeFile(join(root, "workspace", "input.json"), "{}");
  return root;
}

function grant(
  overrides: Partial<WorkflowNode["capabilities"]> = {}
): WorkflowNode["capabilities"] {
  return {
    filesystemRead: [],
    filesystemWrite: [],
    network: [],
    tools: [],
    secretRefs: [],
    ...overrides
  };
}

function capturingBackend(): {
  backend: SandboxBackend;
  specs: IsolatedSandboxSpec[];
} {
  const specs: IsolatedSandboxSpec[] = [];
  return {
    specs,
    backend: {
      run: async (spec) => {
        specs.push(spec);
        return { exitCode: 0, stdout: "{}", stderr: "" };
      }
    }
  };
}

describe("SandboxLauncher", () => {
  it("passes only brokered secrets and never copies the parent environment", async () => {
    const root = await workspace();
    const authorizer = await CapabilityAuthorizer.create(
      root,
      grant({ secretRefs: ["API_TOKEN"] })
    );
    const broker: SecretBroker = {
      issue: async (request) => ({
        reference: request.reference,
        environmentVariable: "API_TOKEN",
        value: "brokered-value",
        expiresAt: Date.now() + 60_000
      })
    };
    const { backend, specs } = capturingBackend();
    const launcher = new SandboxLauncher(backend, broker);
    const previous = process.env.AWF_PARENT_SECRET;
    process.env.AWF_PARENT_SECRET = "must-not-leak";
    try {
      const result = await launcher.run(
        {
          tenantId: "tenant-a",
          runId: "run-a",
          nodeId: "node-a",
          authorizer,
          image,
          argv: ["tool"],
          secretRefs: ["API_TOKEN"]
        },
        new AbortController().signal
      );
      expect(specs[0]?.environment).toEqual({ API_TOKEN: "brokered-value" });
      expect(specs[0]?.environment.AWF_PARENT_SECRET).toBeUndefined();
      expect(result.redactionValues).toEqual(["brokered-value"]);
    } finally {
      if (previous === undefined) delete process.env.AWF_PARENT_SECRET;
      else process.env.AWF_PARENT_SECRET = previous;
    }
  });

  it("constructs canonical mounts, egress origins and mandatory isolation", async () => {
    const root = await workspace();
    const authorizer = await CapabilityAuthorizer.create(
      root,
      grant({
        filesystemRead: ["workspace/**"],
        network: ["api.example.com"]
      })
    );
    const { backend, specs } = capturingBackend();
    const launcher = new SandboxLauncher(backend);
    await launcher.run(
      {
        tenantId: "tenant-a",
        runId: "run-a",
        nodeId: "node-a",
        authorizer,
        image,
        argv: ["tool"],
        filesystemRead: ["workspace/input.json"],
        networkUrls: ["https://api.example.com/v1"]
      },
      new AbortController().signal
    );
    expect(specs[0]).toMatchObject({
      environment: {},
      allowedNetworkOrigins: ["https://api.example.com"],
      isolation: {
        rootless: true,
        readOnlyRootFilesystem: true,
        noNewPrivileges: true,
        dropAllCapabilities: true
      },
      mounts: [
        {
          source: join(await realpath(root), "workspace", "input.json"),
          target: "/workspace/workspace/input.json",
          mode: "ro"
        }
      ]
    });
  });

  it("rejects unpinned images before backend execution", async () => {
    const root = await workspace();
    const authorizer = await CapabilityAuthorizer.create(root, grant());
    const { backend, specs } = capturingBackend();
    const launcher = new SandboxLauncher(backend);
    await expect(
      launcher.run(
        {
          tenantId: "tenant-a",
          runId: "run-a",
          nodeId: "node-a",
          authorizer,
          image: "latest",
          argv: ["tool"]
        },
        new AbortController().signal
      )
    ).rejects.toThrow("pinned image");
    expect(specs).toHaveLength(0);
  });
});
