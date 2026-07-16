#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function runVerifier() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["scripts/verify-spec-to-demo-run.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
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
      resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

export function extractVerifierFailures(stderr) {
  if (typeof stderr !== "string") throw new TypeError("verifier stderr must be a string");
  const structured = stderr.match(/AAWP_BROWSER_FINDINGS (\[[^\r\n]+\])/u)?.[1];
  if (structured !== undefined) {
    const failures = JSON.parse(structured);
    if (Array.isArray(failures) && failures.length > 0) {
      return failures.map((failure) =>
        typeof failure?.checkId === "string" && typeof failure?.message === "string"
          ? `${failure.checkId}: ${failure.message}`
          : "Invalid structured browser finding"
      );
    }
  }
  const lines = stderr.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.includes("AssertionError [ERR_ASSERTION]:"));
  if (start < 0) {
    const fallback = lines.find((line) => line.trim().length > 0);
    return fallback === undefined ? ["Verifier failed without a diagnostic"] : [fallback.trim()];
  }
  const first = lines[start].split("AssertionError [ERR_ASSERTION]:")[1]?.trim();
  const failures = first ? [first] : [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed === "false !== true" || trimmed.startsWith("at ")) break;
    failures.push(trimmed);
  }
  return failures.length > 0 ? failures : ["Verifier assertion failed"];
}

export function createFindingReport({ runId, workflowId, exitCode, stdout, stderr }) {
  const failures = exitCode === 0 ? [] : extractVerifierFailures(stderr);
  const findings = failures.map((message) => ({
    id: `finding_${createHash("sha256").update(message).digest("hex").slice(0, 16)}`,
    class: "product_defect",
    severity: "blocking",
    reasonCode: "RELEASE_ACCEPTANCE",
    message,
    affectedPaths: ["artifacts/demo/app.js", "artifacts/demo/styles.css"],
    allowedRepairWrites: [
      "artifacts/demo/app.js",
      "artifacts/demo/index.html",
      "artifacts/demo/styles.css"
    ],
    status: "open"
  }));
  return {
    schemaVersion: "aawp/spec-to-demo-findings/v1",
    runId,
    workflowId,
    status: exitCode === 0 ? "passed" : "failed",
    verifierExitCode: exitCode,
    findings,
    verifierStdout: stdout.trim(),
    verifierStderr: exitCode === 0 ? "" : stderr.slice(-16_000)
  };
}

export async function inspectSpecToDemoRun({ executionDirectory, runId, workflowId }) {
  if (!executionDirectory) throw new Error("AAWP_EXECUTION_DIR is required");
  const result = await runVerifier();
  const report = createFindingReport({ runId, workflowId, ...result });
  const outputDirectory = resolve(executionDirectory, "artifacts", "verification");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, "initial-findings.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return { report, outputPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { report, outputPath } = await inspectSpecToDemoRun({
    executionDirectory: process.env.AAWP_EXECUTION_DIR,
    runId: process.env.AAWP_RUN_ID,
    workflowId: process.env.AAWP_WORKFLOW_ID
  });
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: report.schemaVersion, status: report.status, findingCount: report.findings.length, outputPath })}\n`
  );
}
