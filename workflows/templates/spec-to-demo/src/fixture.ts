import { digestWorkflow } from "@awf/ir";
import type { AcceptanceContract } from "./acceptance/index.js";

export interface FixtureRecord {
  key: string;
  phase: "setup" | "action" | "assertion";
  status?: number;
  payload: unknown;
}

export interface FixtureBundle {
  schemaVersion: "awf/fixture/v1";
  acceptanceContractDigest: string;
  records: FixtureRecord[];
  digest: string;
}

export class FixtureProtocolError extends Error {
  constructor(
    readonly code: "DUPLICATE_FIXTURE" | "MISSING_FIXTURE" | "UNDECLARED_FIXTURE",
    message: string
  ) {
    super(message);
    this.name = "FixtureProtocolError";
  }
}

function collectFixtureKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const child of value) collectFixtureKeys(child, keys);
    return keys;
  }
  if (typeof value !== "object" || value === null) return keys;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "fixture" || key === "fixtureRef") && typeof child === "string") keys.add(child);
    else collectFixtureKeys(child, keys);
  }
  return keys;
}

export function createFixtureBundle(
  contract: AcceptanceContract,
  records: FixtureRecord[]
): FixtureBundle {
  const required = collectFixtureKeys(contract.obligations);
  const byKey = new Map<string, FixtureRecord>();
  for (const record of records) {
    if (byKey.has(record.key)) {
      throw new FixtureProtocolError("DUPLICATE_FIXTURE", `duplicate fixture ${record.key}`);
    }
    if (!required.has(record.key)) {
      throw new FixtureProtocolError("UNDECLARED_FIXTURE", `undeclared fixture ${record.key}`);
    }
    byKey.set(record.key, record);
  }
  for (const key of required) {
    if (!byKey.has(key)) {
      throw new FixtureProtocolError("MISSING_FIXTURE", `missing fixture ${key}`);
    }
  }
  const normalized = [...byKey.values()]
    .map((record) => ({ ...record }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const content = {
    schemaVersion: "awf/fixture/v1" as const,
    acceptanceContractDigest: contract.digest,
    records: normalized
  };
  return { ...content, digest: digestWorkflow(content) };
}
