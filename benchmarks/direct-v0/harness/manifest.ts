import { readFile } from "node:fs/promises";

export const categories = [
  "small-edit",
  "coupled-typescript",
  "closed-scope-generation",
  "frozen-evidence-synthesis"
] as const;

export type BenchmarkCategory = (typeof categories)[number];

export interface BenchmarkCase {
  id: string;
  category: BenchmarkCategory;
  prompt: string;
  seedDir: string;
  verifier: { file: string; args: string[] };
  timeoutMs: number;
}

export interface BenchmarkManifest {
  version: 1;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  concurrency: number;
  cases: BenchmarkCase[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadManifest(path: string): Promise<BenchmarkManifest> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.model !== "string") {
    throw new Error("invalid direct-v0 manifest header");
  }
  if (
    !(["low", "medium", "high"] as const).includes(
      parsed.reasoningEffort as "low" | "medium" | "high"
    )
  ) {
    throw new Error("invalid reasoningEffort");
  }
  if (
    !Number.isInteger(parsed.concurrency) ||
    (parsed.concurrency as number) < 1 ||
    !Array.isArray(parsed.cases)
  ) {
    throw new Error("invalid direct-v0 manifest execution settings");
  }

  const ids = new Set<string>();
  const cases: BenchmarkCase[] = parsed.cases.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || ids.has(item.id)) {
      throw new Error(`invalid or duplicate case id at index ${index}`);
    }
    ids.add(item.id);
    if (!categories.includes(item.category as BenchmarkCategory))
      throw new Error(`invalid category for ${item.id}`);
    if (typeof item.prompt !== "string" || item.prompt.length === 0)
      throw new Error(`missing prompt for ${item.id}`);
    if (typeof item.seedDir !== "string" || !isRecord(item.verifier))
      throw new Error(`invalid paths for ${item.id}`);
    if (
      typeof item.verifier.file !== "string" ||
      !Array.isArray(item.verifier.args) ||
      !item.verifier.args.every((arg) => typeof arg === "string")
    ) {
      throw new Error(`invalid verifier for ${item.id}`);
    }
    if (!Number.isInteger(item.timeoutMs) || (item.timeoutMs as number) < 1)
      throw new Error(`invalid timeout for ${item.id}`);
    return item as unknown as BenchmarkCase;
  });

  return parsed as unknown as BenchmarkManifest & { cases: typeof cases };
}
