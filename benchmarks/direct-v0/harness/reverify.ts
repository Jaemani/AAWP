import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { benchmarkIntegrity } from "./integrity.js";
import { loadManifest } from "./manifest.js";

interface StoredResult {
  id: string;
  passed: boolean;
  modelExitCode: number | null;
  verifierExitCode: number | null;
  timedOut: boolean;
  modelLatencyMs: number;
  verifierLatencyMs: number;
  error: string | null;
}

interface StoredSummary {
  generatedAt: string;
  verificationUpdatedAt?: string;
  totals: { passed: number; failed: number; modelLatencyMs?: { p50: number; p95: number } };
  results: StoredResult[];
  environment: Record<string, unknown>;
  environmentDigest: string;
  [key: string]: unknown;
}

const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function runVerifier(
  file: string,
  args: string[],
  cwd: string
): Promise<{ exitCode: number | null; output: string; latencyMs: number }> {
  const startedAt = Date.now();
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolveResult({ exitCode, output, latencyMs: Date.now() - startedAt });
    });
  });
}

const runId = process.argv[2];
if (runId === undefined || !/^\d{8}T\d{9}Z$/.test(runId)) {
  throw new Error("usage: tsx reverify.ts RUN_ID");
}

const manifestPath = resolve(benchmarkRoot, "manifest.json");
const manifestBytes = await readFile(manifestPath);
const manifest = await loadManifest(manifestPath);
const integrity = await benchmarkIntegrity(benchmarkRoot, manifestBytes, manifest);
const runSummaryPath = resolve(benchmarkRoot, "runs", runId, "summary.json");
const summary = JSON.parse(await readFile(runSummaryPath, "utf8")) as StoredSummary;
const storedById = new Map(summary.results.map((item) => [item.id, item]));
for (const benchmarkCase of manifest.cases) {
  const stored = storedById.get(benchmarkCase.id);
  if (stored === undefined) throw new Error(`run is missing ${benchmarkCase.id}`);
  const workspace = resolve(benchmarkRoot, "workspaces", runId, benchmarkCase.id);
  const verifier = await runVerifier(
    resolve(benchmarkRoot, benchmarkCase.verifier.file),
    benchmarkCase.verifier.args,
    workspace
  );
  stored.verifierExitCode = verifier.exitCode;
  stored.verifierLatencyMs = verifier.latencyMs;
  stored.passed = stored.modelExitCode === 0 && !stored.timedOut && verifier.exitCode === 0;
  stored.error = stored.passed ? null : verifier.output.trim() || "verification failed";
  const logPath = resolve(benchmarkRoot, "runs", runId, "raw", benchmarkCase.id, "verifier.log");
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, verifier.output);
  process.stderr.write(`[direct-v0] ${stored.passed ? "PASS" : "FAIL"} ${benchmarkCase.id}\n`);
}

summary.verificationUpdatedAt = new Date().toISOString();
Object.assign(summary.environment, integrity);
summary.environmentDigest = createHash("sha256")
  .update(JSON.stringify(summary.environment))
  .digest("hex");
summary.totals.passed = summary.results.filter((item) => item.passed).length;
summary.totals.failed = summary.results.filter((item) => !item.passed).length;
const latencies = summary.results
  .map((item) => item.modelLatencyMs)
  .sort((left, right) => left - right);
summary.totals.modelLatencyMs = {
  p50: latencies[Math.max(0, Math.ceil(latencies.length * 0.5) - 1)] ?? 0,
  p95: latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] ?? 0
};
const serialized = `${JSON.stringify(summary, null, 2)}\n`;
await writeFile(runSummaryPath, serialized);
await writeFile(resolve(benchmarkRoot, "summary.json"), serialized);
process.stdout.write(serialized);
if (summary.totals.failed > 0) process.exitCode = 1;
