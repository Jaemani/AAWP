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

function rejectNonJsonProperties(
  value: object,
  path: string,
  ignoredNonEnumerableNames: Set<string> = new Set()
): void {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    fail(path, "symbol keys are unsupported");
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if ("get" in descriptor || "set" in descriptor) {
      fail(`${path}/${key}`, "accessor properties are unsupported");
    }
    if (!descriptor.enumerable && !ignoredNonEnumerableNames.has(key)) {
      fail(`${path}/${key}`, "non-enumerable properties are unsupported");
    }
  }
}

function normalizeValue(value: unknown, path: string, seenObjects: WeakSet<object>): JsonValue {
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
    if (seenObjects.has(value)) {
      fail(path, "cycles are unsupported");
    }
    rejectNonJsonProperties(value, path, new Set(["length"]));
    seenObjects.add(value);
    const normalized: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        fail(`${path}/${index}`, "sparse arrays are unsupported");
      }
      normalized.push(normalizeValue(value[index], `${path}/${index}`, seenObjects));
    }
    seenObjects.delete(value);
    return normalized;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(path, "custom prototype objects are unsupported");
    }
    if (seenObjects.has(value)) {
      fail(path, "cycles are unsupported");
    }
    rejectNonJsonProperties(value, path);
    seenObjects.add(value);
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
      normalized[normalizedKey] = normalizeValue(
        input[originalKey],
        `${path}/${normalizedKey}`,
        seenObjects
      );
    }
    seenObjects.delete(value);
    return normalized;
  }
  fail(path, `unsupported value type ${typeof value}`);
}

export function canonicalize(value: unknown): string {
  return (
    JSON.stringify(normalizeValue(value, "", new WeakSet<object>())) ??
    fail("", "unable to encode value")
  );
}

export function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

export function digestWorkflow(value: unknown): string {
  return sha256Hex(canonicalize(value));
}
