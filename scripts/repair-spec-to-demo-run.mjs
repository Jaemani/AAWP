#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

async function fileHashes(root, directory = root) {
  const result = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [childPath, hash] of await fileHashes(root, path)) result.set(childPath, hash);
    } else if (entry.isFile()) {
      result.set(
        relative(root, path).split(sep).join("/"),
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex")
      );
    }
  }
  return result;
}

export function changedPaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

export function unauthorizedChanges(changed, allowed) {
  const allowedSet = new Set(allowed);
  return changed.filter((path) => !allowedSet.has(path));
}

function runCommand({ command, cwd, env }) {
  return new Promise((resolvePromise, reject) => {
    const [executable, ...args] = command;
    const child = spawn(executable, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

export async function repairSpecToDemoRun({ root, executionDirectory, inputPath }) {
  assert.ok(root, "repository root is required");
  assert.ok(executionDirectory, "AAWP_EXECUTION_DIR is required");
  assert.ok(inputPath, "AAWP_INPUT_PATH is required");
  const reportPath = resolve(executionDirectory, "artifacts/verification/initial-findings.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.schemaVersion, "aawp/spec-to-demo-findings/v1");
  if (report.status === "passed") {
    return { status: "skipped", reason: "initial verifier passed", changedPaths: [] };
  }
  assert.ok(Array.isArray(report.findings) && report.findings.length > 0);

  const allowedWrites = [
    ...new Set(report.findings.flatMap((finding) => finding.allowedRepairWrites ?? []))
  ].sort();
  assert.ok(allowedWrites.length > 0, "open findings have no repair authority");
  const before = await fileHashes(executionDirectory);
  const prompt = [
    "Execute one bounded spec-to-demo repair round.",
    `Read the input at ${resolve(inputPath)}.`,
    `Read the design contract at ${resolve(root, "DESIGN.md")}.`,
    `Read the workflow interaction contract at ${resolve(root, "workflows/templates/spec-to-demo/WORKFLOW.md")}.`,
    `Read the verifier findings at ${reportPath}.`,
    `Repair the current candidate at ${resolve(executionDirectory, "artifacts/demo")}.`,
    `You may modify only these execution-relative files: ${allowedWrites.join(", ")}.`,
    "Do not rebuild the demo, change manifest.json, add screens, read another run, run Playwright, inspect verifier source, or alter repository files.",
    "Preserve exact source copy, canonical screen hashes, working interactions and all behavior not named by a finding.",
    "Repair observable behavior, not marker-only shortcuts: each action surface must contain its own editable fields, one submit, feedback and state; error triggers are separate from success submit; duplicate evidence appears only after rejection; command state remains observable on the source screen.",
    "Make the smallest changes that close every finding, then stop. Do not merely describe the repair."
  ].join("\n");
  const model = await runCommand({
    cwd: executionDirectory,
    env: { ...process.env },
    command: [
      "codex",
      "-a",
      "never",
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--model",
      "gpt-5.5",
      "-c",
      'model_reasoning_effort="medium"',
      "--cd",
      ".",
      prompt
    ]
  });
  if (model.exitCode !== 0) {
    throw new Error(
      `repair model exited with code ${model.exitCode}: ${model.stderr.slice(-4000)}`
    );
  }
  const after = await fileHashes(executionDirectory);
  const changed = changedPaths(before, after);
  const unauthorized = unauthorizedChanges(changed, allowedWrites);
  assert.deepEqual(
    unauthorized,
    [],
    `repair changed unauthorized paths: ${unauthorized.join(", ")}`
  );
  assert.ok(changed.length > 0, "repair made no artifact change");

  const publicCheck = await runCommand({
    cwd: root,
    env: { ...process.env, AAWP_INPUT_PATH: inputPath, AAWP_EXECUTION_DIR: executionDirectory },
    command: [process.execPath, "scripts/check-spec-to-demo-artifact.mjs"]
  });
  if (publicCheck.exitCode !== 0) {
    throw new Error(`repair failed public contract: ${publicCheck.stderr.slice(-4000)}`);
  }
  return { status: "repaired", changedPaths: changed, modelStdout: model.stdout };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await repairSpecToDemoRun({
    root: process.cwd(),
    executionDirectory: process.env.AAWP_EXECUTION_DIR,
    inputPath: process.env.AAWP_INPUT_PATH
  });
  if (result.modelStdout) process.stdout.write(result.modelStdout);
  process.stdout.write(
    `AAWP_EVENT ${JSON.stringify({ type: "repair_completed", status: result.status, changedPaths: result.changedPaths })}\n`
  );
}
