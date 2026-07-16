import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function environmentPath(name: "AAWP_INPUT_PATH" | "AAWP_EXECUTION_DIR"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return resolve(value);
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function readRunInput(): Promise<JsonRecord> {
  const input = await readJson(environmentPath("AAWP_INPUT_PATH"));
  if (!isRecord(input)) throw new Error("workflow input must be an object");
  return input;
}

export async function resolvePinnedProjectFile(path: unknown): Promise<string> {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new Error("pinned artifact path must be project-relative");
  }
  const root = await realpath(resolve("."));
  const candidate = await realpath(resolve(root, path));
  const rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("pinned artifact escapes project workspace");
  }
  return candidate;
}

export function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function ensureArtifactDirectory(): Promise<string> {
  const path = resolve(environmentPath("AAWP_EXECUTION_DIR"), "artifacts", "spec-revision");
  await mkdir(path, { recursive: true });
  return path;
}

export function requiredRecord(parent: JsonRecord, key: string): JsonRecord {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`${key} must be an object`);
  return value;
}

export function requiredString(parent: JsonRecord, key: string): string {
  const value = parent[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a string`);
  return value;
}
