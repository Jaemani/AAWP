import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { BenchmarkManifest } from "./manifest.js";

async function treeEntries(
  root: string,
  relativeDir: string
): Promise<Array<{ path: string; bytes: Buffer }>> {
  const entries: Array<{ path: string; bytes: Buffer }> = [];
  const names = await readdir(resolve(root, relativeDir), { withFileTypes: true });
  names.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const name of names) {
    const relativePath = `${relativeDir}/${name.name}`;
    if (name.isDirectory()) entries.push(...(await treeEntries(root, relativePath)));
    else if (name.isFile())
      entries.push({ path: relativePath, bytes: await readFile(resolve(root, relativePath)) });
    else throw new Error(`unsupported benchmark seed entry ${relativePath}`);
  }
  return entries;
}

function digestEntries(entries: Array<{ path: string; bytes: Buffer }>): string {
  const hash = createHash("sha256");
  for (const entry of entries) {
    hash.update(entry.path, "utf8");
    hash.update("\0");
    hash.update(entry.bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function benchmarkIntegrity(
  benchmarkRoot: string,
  manifestBytes: Buffer,
  manifest: BenchmarkManifest
): Promise<{
  manifestSha256: string;
  seedTreeSha256: string;
  verifierSha256: string;
  cohortSha256: string;
}> {
  const seedEntries = (
    await Promise.all(
      manifest.cases.map((benchmarkCase) => treeEntries(benchmarkRoot, benchmarkCase.seedDir))
    )
  ).flat();
  seedEntries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  const verifierPaths = [
    ...new Set(manifest.cases.map((benchmarkCase) => benchmarkCase.verifier.file))
  ].sort();
  const verifierEntries = await Promise.all(
    verifierPaths.map(async (path) => ({
      path,
      bytes: await readFile(resolve(benchmarkRoot, path))
    }))
  );
  const manifestEntry = { path: "manifest.json", bytes: manifestBytes };
  return {
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    seedTreeSha256: digestEntries(seedEntries),
    verifierSha256: digestEntries(verifierEntries),
    cohortSha256: digestEntries([manifestEntry, ...seedEntries, ...verifierEntries])
  };
}
