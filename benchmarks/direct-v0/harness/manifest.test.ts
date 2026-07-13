import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadManifest } from "./manifest.js";
import { readFile } from "node:fs/promises";
import { benchmarkIntegrity } from "./integrity.js";

const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("direct-v0 manifest", () => {
  it("contains the frozen ten-case cohort", async () => {
    const manifest = await loadManifest(resolve(benchmarkRoot, "manifest.json"));
    expect(manifest.cases).toHaveLength(10);
    expect(manifest.concurrency).toBe(3);
    expect(manifest.model).toBe("gpt-5.5");
    expect(manifest.reasoningEffort).toBe("medium");
    expect(
      Object.fromEntries(
        [
          "small-edit",
          "coupled-typescript",
          "closed-scope-generation",
          "frozen-evidence-synthesis"
        ].map((category) => [
          category,
          manifest.cases.filter((item) => item.category === category).length
        ])
      )
    ).toEqual({
      "small-edit": 3,
      "coupled-typescript": 3,
      "closed-scope-generation": 2,
      "frozen-evidence-synthesis": 2
    });
  });

  it("digests the manifest, seed trees, and hidden verifier", async () => {
    const manifestPath = resolve(benchmarkRoot, "manifest.json");
    const bytes = await readFile(manifestPath);
    const manifest = await loadManifest(manifestPath);
    const integrity = await benchmarkIntegrity(benchmarkRoot, bytes, manifest);
    expect(integrity.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(integrity.seedTreeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(integrity.verifierSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(integrity.cohortSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
