import { createHash } from "node:crypto";

export class CanonicalizationError extends Error {
  constructor(
    message: string,
    readonly path: string
  ) {
    super(`${path}: ${message}`);
    this.name = "CanonicalizationError";
  }
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function fail(path: string, message: string): never {
  throw new CanonicalizationError(message, path);
}

function normalizeValue(value: unknown, path: string): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value.normalize("NFC");
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(path, "non-finite numbers are unsupported");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeValue(item, `${path}/${index}`));
  }
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const normalized: Record<string, JsonValue> = {};
    const seen = new Map<string, string>();
    for (const key of Object.keys(input)) {
      const normalizedKey = key.normalize("NFC");
      const prior = seen.get(normalizedKey);
      if (prior !== undefined && prior !== key) {
        fail(path, `post-normalization key collision: ${prior} and ${key}`);
      }
      seen.set(normalizedKey, key);
    }
    for (const normalizedKey of Array.from(seen.keys()).sort()) {
      const originalKey = seen.get(normalizedKey);
      if (originalKey === undefined) {
        fail(path, `missing original key for ${normalizedKey}`);
      }
      normalized[normalizedKey] = normalizeValue(input[originalKey], `${path}/${normalizedKey}`);
    }
    return normalized;
  }
  fail(path, `unsupported value type ${typeof value}`);
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalizeValue(value, "")) ?? fail("", "unable to encode value");
}

export function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

export function digestWorkflow(value: unknown): string {
  return sha256Hex(canonicalize(value));
}
