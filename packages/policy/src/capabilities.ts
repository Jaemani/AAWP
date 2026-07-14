import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path";
import type { WorkflowNode } from "@awf/ir";

export type CapabilityGrant = WorkflowNode["capabilities"];
export type FilesystemAccess = "read" | "write";
export type CapabilityDimension = "filesystem" | "network" | "tool" | "secret";

export interface AuthorizedFilesystemPath {
  access: FilesystemAccess;
  requestedPath: string;
  canonicalPath: string;
  workspacePath: string;
}

export class CapabilityDeniedError extends Error {
  constructor(
    readonly dimension: CapabilityDimension,
    readonly requested: string,
    message = `${dimension} capability denied: ${requested}`
  ) {
    super(message);
    this.name = "CapabilityDeniedError";
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function normalizeRelativePath(input: string): string {
  if (
    input.length === 0 ||
    input.includes("\0") ||
    input.includes("\\") ||
    isAbsolute(input) ||
    win32.isAbsolute(input)
  ) {
    throw new CapabilityDeniedError("filesystem", input, `invalid workspace path: ${input}`);
  }
  const parts = input.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new CapabilityDeniedError("filesystem", input, `invalid workspace path: ${input}`);
  }
  return parts.join("/");
}

function normalizePattern(input: string): string {
  if (input === "*") return input;
  if (input.endsWith("/**")) {
    return `${normalizeRelativePath(input.slice(0, -3))}/**`;
  }
  return normalizeRelativePath(input);
}

function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path.startsWith(`${prefix}/`);
  }
  return path === pattern;
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function workspacePath(root: string, candidate: string): string {
  return relative(root, candidate).split(sep).join("/");
}

async function canonicalWriteTarget(target: string): Promise<string> {
  const missingParts: string[] = [];
  let current = target;
  while (true) {
    try {
      await lstat(current);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missingParts.unshift(basename(current));
      current = parent;
      continue;
    }
    const existing = await realpath(current);
    return resolve(existing, ...missingParts);
  }
}

function networkGrantMatches(grant: string, url: URL): boolean {
  const normalized = grant.toLowerCase();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      return new URL(normalized).origin === url.origin;
    } catch {
      return false;
    }
  }
  if (url.port !== "") return false;
  if (normalized.startsWith("*.")) {
    const suffix = normalized.slice(2);
    return url.hostname.endsWith(`.${suffix}`) && url.hostname !== suffix;
  }
  return normalized === url.hostname;
}

export class CapabilityAuthorizer {
  private constructor(
    private readonly root: string,
    private readonly grant: CapabilityGrant,
    private readonly readPatterns: string[],
    private readonly writePatterns: string[]
  ) {}

  static async create(
    workspaceRoot: string,
    grant: CapabilityGrant
  ): Promise<CapabilityAuthorizer> {
    const root = await realpath(workspaceRoot);
    return new CapabilityAuthorizer(
      root,
      grant,
      grant.filesystemRead.map(normalizePattern),
      grant.filesystemWrite.map(normalizePattern)
    );
  }

  async authorizeFilesystem(
    access: FilesystemAccess,
    requestedPath: string
  ): Promise<AuthorizedFilesystemPath> {
    const normalized = normalizeRelativePath(requestedPath);
    const patterns = access === "read" ? this.readPatterns : this.writePatterns;
    if (!patterns.some((pattern) => patternMatches(pattern, normalized))) {
      throw new CapabilityDeniedError("filesystem", requestedPath);
    }

    const lexical = resolve(this.root, normalized);
    if (!isWithin(this.root, lexical)) {
      throw new CapabilityDeniedError("filesystem", requestedPath);
    }
    let canonical: string;
    try {
      canonical = access === "read" ? await realpath(lexical) : await canonicalWriteTarget(lexical);
    } catch (error) {
      throw new CapabilityDeniedError(
        "filesystem",
        requestedPath,
        `unable to canonicalize ${requestedPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!isWithin(this.root, canonical)) {
      throw new CapabilityDeniedError(
        "filesystem",
        requestedPath,
        "filesystem path escapes workspace"
      );
    }
    const canonicalWorkspacePath = workspacePath(this.root, canonical);
    if (!patterns.some((pattern) => patternMatches(pattern, canonicalWorkspacePath))) {
      throw new CapabilityDeniedError(
        "filesystem",
        requestedPath,
        "canonical filesystem path is outside the granted scope"
      );
    }
    return {
      access,
      requestedPath,
      canonicalPath: canonical,
      workspacePath: canonicalWorkspacePath
    };
  }

  authorizeNetwork(requestedUrl: string): URL {
    let url: URL;
    try {
      url = new URL(requestedUrl);
    } catch {
      throw new CapabilityDeniedError("network", requestedUrl, "network URL is invalid");
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      !this.grant.network.some((item) => networkGrantMatches(item, url))
    ) {
      throw new CapabilityDeniedError("network", requestedUrl);
    }
    return url;
  }

  authorizeTool(toolId: string): void {
    if (!this.grant.tools.includes(toolId)) {
      throw new CapabilityDeniedError("tool", toolId);
    }
  }

  authorizeSecret(reference: string): void {
    if (!this.grant.secretRefs.includes(reference)) {
      throw new CapabilityDeniedError("secret", reference);
    }
  }
}
