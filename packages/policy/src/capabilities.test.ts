import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowNode } from "@awf/ir";
import { describe, expect, it } from "vitest";
import { CapabilityAuthorizer, CapabilityDeniedError } from "./capabilities.js";

type Grant = WorkflowNode["capabilities"];

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    filesystemRead: [],
    filesystemWrite: [],
    network: [],
    tools: [],
    secretRefs: [],
    ...overrides
  };
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "awf-policy-"));
  await mkdir(join(root, "workspace", "public"), { recursive: true });
  await mkdir(join(root, "workspace", "private"), { recursive: true });
  await writeFile(join(root, "workspace", "public", "input.txt"), "ok");
  await writeFile(join(root, "workspace", "private", "secret.txt"), "secret");
  return root;
}

describe("CapabilityAuthorizer", () => {
  it("defaults every capability dimension to deny", async () => {
    const authorizer = await CapabilityAuthorizer.create(await workspace(), grant());
    await expect(
      authorizer.authorizeFilesystem("read", "workspace/public/input.txt")
    ).rejects.toBeInstanceOf(CapabilityDeniedError);
    expect(() => authorizer.authorizeNetwork("https://api.example.com/data")).toThrow(
      CapabilityDeniedError
    );
    expect(() => authorizer.authorizeTool("mcp.search")).toThrow(CapabilityDeniedError);
    expect(() => authorizer.authorizeSecret("SEARCH_TOKEN")).toThrow(CapabilityDeniedError);
  });

  it("rejects lexical path traversal", async () => {
    const authorizer = await CapabilityAuthorizer.create(
      await workspace(),
      grant({ filesystemRead: ["*"] })
    );
    await expect(authorizer.authorizeFilesystem("read", "workspace/../outside")).rejects.toThrow(
      "invalid workspace path"
    );
  });

  it("rejects a symlink that escapes the workspace", async () => {
    const root = await workspace();
    const outside = await mkdtemp(join(tmpdir(), "awf-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "workspace", "public", "escape"));
    const authorizer = await CapabilityAuthorizer.create(
      root,
      grant({ filesystemRead: ["workspace/public/**"] })
    );
    await expect(
      authorizer.authorizeFilesystem("read", "workspace/public/escape/secret.txt")
    ).rejects.toThrow("escapes workspace");
  });

  it("rejects a symlink to an in-workspace path outside the grant", async () => {
    const root = await workspace();
    await symlink("../private", join(root, "workspace", "public", "private-link"));
    const authorizer = await CapabilityAuthorizer.create(
      root,
      grant({ filesystemRead: ["workspace/public/**"] })
    );
    await expect(
      authorizer.authorizeFilesystem("read", "workspace/public/private-link/secret.txt")
    ).rejects.toThrow("outside the granted scope");
  });

  it("canonicalizes a non-existing write target under the granted directory", async () => {
    const root = await workspace();
    const authorizer = await CapabilityAuthorizer.create(
      root,
      grant({ filesystemWrite: ["workspace/public/**"] })
    );
    const authorized = await authorizer.authorizeFilesystem(
      "write",
      "workspace/public/new/result.json"
    );
    expect(authorized.workspacePath).toBe("workspace/public/new/result.json");
    expect(authorized.canonicalPath).toBe(
      join(await realpath(root), "workspace", "public", "new", "result.json")
    );
  });

  it("rejects a dangling symlink write target", async () => {
    const root = await workspace();
    await symlink("../../missing", join(root, "workspace", "public", "dangling"));
    const authorizer = await CapabilityAuthorizer.create(
      root,
      grant({ filesystemWrite: ["workspace/public/**"] })
    );
    await expect(
      authorizer.authorizeFilesystem("write", "workspace/public/dangling/result.json")
    ).rejects.toThrow("unable to canonicalize");
  });

  it("allows only declared HTTP(S) hosts and rejects egress otherwise", async () => {
    const authorizer = await CapabilityAuthorizer.create(
      await workspace(),
      grant({ network: ["api.example.com", "https://fixed.example.net:8443"] })
    );
    expect(authorizer.authorizeNetwork("https://api.example.com/v1").hostname).toBe(
      "api.example.com"
    );
    expect(authorizer.authorizeNetwork("https://fixed.example.net:8443/v1").port).toBe("8443");
    expect(() => authorizer.authorizeNetwork("https://evil.example/v1")).toThrow(
      CapabilityDeniedError
    );
    expect(() => authorizer.authorizeNetwork("https://api.example.com:9443/v1")).toThrow(
      CapabilityDeniedError
    );
  });
});
