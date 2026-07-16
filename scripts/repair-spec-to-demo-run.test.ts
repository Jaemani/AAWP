import { expect, it } from "vitest";
// @ts-expect-error -- the repair helper is an ESM JavaScript script.
import { changedPaths, unauthorizedChanges } from "./repair-spec-to-demo-run.mjs";

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
