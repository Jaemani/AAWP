export class JsonPointerError extends Error {
  constructor(
    readonly code: "INVALID_POINTER" | "MISSING_TARGET" | "INVALID_ARRAY_INDEX" | "UNSAFE_SEGMENT",
    message: string
  ) {
    super(message);
    this.name = "JsonPointerError";
  }
}

function decodeSegment(segment: string): string {
  if (/~(?:[^01]|$)/.test(segment)) {
    throw new JsonPointerError("INVALID_POINTER", `invalid JSON Pointer escape in ${segment}`);
  }
  const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
  if (["__proto__", "prototype", "constructor"].includes(decoded)) {
    throw new JsonPointerError("UNSAFE_SEGMENT", `unsafe JSON Pointer segment ${decoded}`);
  }
  return decoded;
}

export function parseJsonPointer(pointer: string): string[] {
  if (!pointer.startsWith("/") || pointer === "/") {
    throw new JsonPointerError("INVALID_POINTER", `pointer must target a field: ${pointer}`);
  }
  return pointer.slice(1).split("/").map(decodeSegment);
}

function arrayIndex(segment: string, length: number, allowAppend: boolean): number {
  if (allowAppend && segment === "-") return length;
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) {
    throw new JsonPointerError("INVALID_ARRAY_INDEX", `invalid array index ${segment}`);
  }
  const index = Number(segment);
  if (index >= length + (allowAppend ? 1 : 0)) {
    throw new JsonPointerError("MISSING_TARGET", `array index ${index} is out of range`);
  }
  return index;
}

export function readJsonPointer(document: unknown, pointer: string): unknown {
  let current = document;
  for (const segment of parseJsonPointer(pointer)) {
    if (Array.isArray(current)) {
      current = current[arrayIndex(segment, current.length, false)];
    } else if (typeof current === "object" && current !== null && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      throw new JsonPointerError("MISSING_TARGET", `missing target ${pointer}`);
    }
  }
  return current;
}

export function resolveJsonPointerParent(
  document: unknown,
  pointer: string
): { parent: unknown; key: string } {
  const segments = parseJsonPointer(pointer);
  const key = segments.pop()!;
  let parent = document;
  for (const segment of segments) {
    if (Array.isArray(parent)) {
      parent = parent[arrayIndex(segment, parent.length, false)];
    } else if (typeof parent === "object" && parent !== null && segment in parent) {
      parent = (parent as Record<string, unknown>)[segment];
    } else {
      throw new JsonPointerError("MISSING_TARGET", `missing parent for ${pointer}`);
    }
  }
  return { parent, key };
}

export function indexForPointer(parent: unknown, key: string, allowAppend: boolean): number {
  if (!Array.isArray(parent)) {
    throw new JsonPointerError("INVALID_ARRAY_INDEX", `${key} does not address an array`);
  }
  return arrayIndex(key, parent.length, allowAppend);
}
