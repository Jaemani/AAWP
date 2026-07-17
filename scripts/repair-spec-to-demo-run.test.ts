import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
// @ts-expect-error -- the repair helper is an ESM JavaScript script.
import {
  assertMonotonicRepair,
  changedPaths,
  restoreDirectory,
  snapshotDirectory,
  unauthorizedChanges
} from "./repair-spec-to-demo-run.mjs";

it("finds created, changed and deleted files deterministically", () => {
  const before = new Map([
    ["artifacts/demo/app.js", "a"],
    ["artifacts/demo/styles.css", "b"],
    ["artifacts/demo/removed.txt", "c"]
  ]);
  const after = new Map([
    ["artifacts/demo/app.js", "z"],
    ["artifacts/demo/styles.css", "b"],
    ["artifacts/demo/new.txt", "d"]
  ]);
  expect(changedPaths(before, after)).toEqual([
    "artifacts/demo/app.js",
    "artifacts/demo/new.txt",
    "artifacts/demo/removed.txt"
  ]);
});

it("rejects every write outside verifier-granted paths", () => {
  expect(
    unauthorizedChanges(
      ["artifacts/demo/app.js", "artifacts/demo/manifest.json"],
      ["artifacts/demo/app.js"]
    )
  ).toEqual(["artifacts/demo/manifest.json"]);
});

it("allows a second bounded repair only after monotonic improvement", () => {
  expect(() =>
    assertMonotonicRepair(
      { findings: [{ id: "a" }, { id: "b" }, { id: "c" }] },
      { findings: [{ id: "d" }] }
    )
  ).not.toThrow();
  expect(() =>
    assertMonotonicRepair({ findings: [{ id: "a" }, { id: "b" }] }, { findings: [{ id: "a" }] })
  ).toThrow(/repeated findings/);
  expect(() =>
    assertMonotonicRepair({ findings: [{ id: "a" }] }, { findings: [{ id: "b" }] })
  ).toThrow(/did not reduce/);
});

it("restores the pre-repair Demo snapshot after a failed repair", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "aawp-repair-rollback-"));
  try {
    await writeFile(resolve(root, "app.js"), "original app");
    await writeFile(resolve(root, "styles.css"), "original styles");
    const snapshot = await snapshotDirectory(root);
    await writeFile(resolve(root, "app.js"), "invalid changed copy");
    await writeFile(resolve(root, "extra.txt"), "unauthorized");

    await restoreDirectory(root, snapshot);

    await expect(readFile(resolve(root, "app.js"), "utf8")).resolves.toBe("original app");
    await expect(readFile(resolve(root, "styles.css"), "utf8")).resolves.toBe("original styles");
    await expect(readFile(resolve(root, "extra.txt"), "utf8")).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
