#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function assertRunId(runId) {
  assert.match(runId, /^run_[0-9a-f-]+$/u, "invalid run ID");
  return runId;
}

async function directoryEntries(root, directory = root) {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) entries.push(...(await directoryEntries(root, path)));
    if (entry.isFile()) {
      entries.push({
        path: relative(root, path).split(sep).join("/"),
        digest: sha256(await readFile(path))
      });
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function runVerifier({ root, runDirectory, run }) {
  return new Promise((resolvePromise, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ["scripts/verify-spec-to-demo-run.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        AAWP_INPUT_PATH: resolve(runDirectory, "input.json"),
        AAWP_EXECUTION_DIR: runDirectory,
        AAWP_RUN_ID: run.runId,
        AAWP_WORKFLOW_ID: run.workflowId,
        AAWP_NODE_ID: "reverify-release",
        AAWP_REVERIFY_SOURCE_WORKFLOW_VERSION: run.workflowVersion
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
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
      resolvePromise({
        exitCode: exitCode ?? 1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      });
    });
  });
}

function parseVerdict(stdout) {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      const value = JSON.parse(line);
      if (value?.schemaVersion === "aawp/verdict/v1") return value;
    } catch {
      // Ignore non-protocol output and keep looking for the final verdict.
    }
  }
  return undefined;
}

export async function reverifySpecToDemoRun({ root, runId }) {
  assertRunId(runId);
  const runDirectory = resolve(root, "runs", runId);
  const run = JSON.parse(await readFile(resolve(runDirectory, "run.json"), "utf8"));
  assert.equal(run.runId, runId);
  assert.equal(run.workflowId, "spec-to-demo");
  assert.equal(typeof run.workflowVersion, "string");
  const demoDirectory = resolve(runDirectory, "artifacts", "demo");
  const demoEntries = await directoryEntries(demoDirectory);
  assert.ok(demoEntries.length > 0, "source run has no Demo artifact");
  const demoDigest = sha256(JSON.stringify(demoEntries));
  const [verifierBytes, workflowBytes] = await Promise.all([
    readFile(resolve(root, "scripts/verify-spec-to-demo-run.mjs")),
    readFile(resolve(root, "workflows/templates/spec-to-demo/WORKFLOW.md"))
  ]);
  const attemptId = `reverify_${new Date().toISOString().replace(/[-:.TZ]/gu, "")}_${randomUUID().slice(0, 8)}`;
  const attemptDirectory = resolve(root, "runs", "reverifications", attemptId);
  await mkdir(attemptDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const result = await runVerifier({ root, runDirectory, run });
  const completedAt = new Date().toISOString();
  const verdict = parseVerdict(result.stdout);
  const report = {
    schemaVersion: "aawp/demo-reverification/v1",
    attemptId,
    sourceRunId: runId,
    sourceRunStatus: run.status,
    sourceWorkflowVersion: run.workflowVersion,
    verifierWorkflowVersion: "0.7.3",
    inputDigest: run.inputDigest,
    snapshotContentDigest: run.demo?.contentDigest ?? null,
    demoDigest,
    verifierDigest: sha256(verifierBytes),
    workflowContractDigest: sha256(workflowBytes),
    startedAt,
    completedAt,
    durationMs: result.durationMs,
    status: result.exitCode === 0 && verdict?.status === "passed" ? "passed" : "failed",
    verdict: verdict ?? null,
    stderr: result.exitCode === 0 ? "" : result.stderr.slice(-16_000)
  };
  const reportPath = resolve(attemptDirectory, "verdict.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return { report, reportPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const runId = process.argv[2];
  if (!runId) throw new Error("usage: reverify-spec-to-demo-run.mjs <run-id>");
  const result = await reverifySpecToDemoRun({ root: process.cwd(), runId });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.report.status !== "passed") process.exitCode = 1;
}
