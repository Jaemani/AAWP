#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = process.cwd();
const legacyRoot = resolve(root, ".awf");
const runRoot = resolve(root, "runs");
const historyPath = resolve(runRoot, "history.jsonl");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function records(source, path) {
  return source
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const record = JSON.parse(line);
      if (record.schemaVersion !== "awf/studio-run/v1" || !record.runId) {
        throw new Error(`invalid run record: ${path}:${index + 1}`);
      }
      return { line: line.trim(), record };
    });
}

await mkdir(runRoot, { recursive: true });
const historyFiles = (await readdir(legacyRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
  .map((entry) => join(legacyRoot, entry.name));
if (await exists(historyPath)) historyFiles.unshift(historyPath);

const snapshots = [];
const seen = new Set();
const latestByRun = new Map();
for (const path of historyFiles) {
  for (const item of records(await readFile(path, "utf8"), path)) {
    const digest = createHash("sha256").update(item.line).digest("hex");
    if (!seen.has(digest)) {
      seen.add(digest);
      snapshots.push(item);
    }
    const previous = latestByRun.get(item.record.runId);
    if (!previous || item.record.completedAt >= previous.completedAt) {
      latestByRun.set(item.record.runId, item.record);
    }
  }
}
await writeFile(historyPath, snapshots.map((item) => item.line).join("\n") + "\n", {
  encoding: "utf8",
  mode: 0o600
});

const legacyDirectories = (await readdir(legacyRoot, { withFileTypes: true })).filter((entry) =>
  entry.isDirectory()
);
let copiedExecutions = 0;
let copiedDemos = 0;
for (const parent of legacyDirectories) {
  const sourceParent = join(legacyRoot, parent.name);
  if (parent.name.includes("executions")) {
    for (const entry of await readdir(sourceParent, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("run_")) continue;
      await mkdir(join(runRoot, entry.name), { recursive: true });
      await cp(join(sourceParent, entry.name), join(runRoot, entry.name), {
        recursive: true,
        force: false,
        errorOnExist: false
      });
      copiedExecutions += 1;
    }
  }
  if (parent.name === "demos" || parent.name.endsWith("-demos")) {
    for (const entry of await readdir(sourceParent, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("run_")) continue;
      const target = join(runRoot, entry.name, "demo");
      if (await exists(target)) continue;
      await mkdir(join(runRoot, entry.name), { recursive: true });
      await cp(join(sourceParent, entry.name), target, { recursive: true });
      copiedDemos += 1;
    }
  }
}

for (const [runId, record] of latestByRun) {
  const directory = join(runRoot, runId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "run.json"), `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

const onboarded = [];
for (const runId of latestByRun.keys()) {
  const marker = join(runRoot, runId, "demo", ".aawp-onboarded");
  if (await exists(marker)) onboarded.push(runId);
}
onboarded.sort((left, right) => {
  const leftTime = latestByRun.get(left)?.createdAt ?? "";
  const rightTime = latestByRun.get(right)?.createdAt ?? "";
  return rightTime.localeCompare(leftTime);
});
for (const runId of onboarded.slice(1)) {
  await rm(join(runRoot, runId, "demo", ".aawp-onboarded"), { force: true });
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    historyFiles: historyFiles.length,
    snapshots: snapshots.length,
    runs: latestByRun.size,
    copiedExecutions,
    copiedDemos,
    onboarded: onboarded[0] ?? null,
    root: runRoot
  })}\n`
);
