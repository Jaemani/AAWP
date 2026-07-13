import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { benchmarkIntegrity } from "./integrity.js";
import { loadManifest, type BenchmarkCase } from "./manifest.js";

interface Usage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  latencyMs: number;
}

interface CaseResult {
  id: string;
  category: string;
  passed: boolean;
  modelExitCode: number | null;
  verifierExitCode: number | null;
  timedOut: boolean;
  modelLatencyMs: number;
  verifierLatencyMs: number;
  usage: Usage | null;
  error: string | null;
}

const harnessDir = dirname(fileURLToPath(import.meta.url));
const benchmarkRoot = resolve(harnessDir, "..");
const repoRoot = resolve(benchmarkRoot, "../..");

function parseArgs(argv: string[]): { caseIds: string[]; concurrency?: number; model?: string } {
  const result: { caseIds: string[]; concurrency?: number; model?: string } = { caseIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--case" && value !== undefined) {
      result.caseIds.push(value);
      index += 1;
    } else if (arg === "--concurrency" && value !== undefined) {
      result.concurrency = Number(value);
      index += 1;
    } else if (arg === "--model" && value !== undefined) {
      result.model = value;
      index += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${arg}`);
    }
  }
  return result;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<CommandResult> {
  const startedAt = Date.now();
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolveResult({ exitCode, stdout, stderr, timedOut, latencyMs: Date.now() - startedAt });
    });
  });
}

function parseUsage(jsonl: string): Usage | null {
  const total: Usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0
  };
  let found = false;
  for (const line of jsonl.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const event = JSON.parse(line) as { type?: string; usage?: Record<string, unknown> };
      if (event.type !== "turn.completed" || event.usage === undefined) continue;
      found = true;
      total.inputTokens += Number(event.usage.input_tokens ?? 0);
      total.cachedInputTokens += Number(event.usage.cached_input_tokens ?? 0);
      total.outputTokens += Number(event.usage.output_tokens ?? 0);
      total.reasoningOutputTokens += Number(event.usage.reasoning_output_tokens ?? 0);
    } catch {
      // 원본 JSONL은 보존하고, 알 수 없는 행은 usage 합계에서만 제외한다.
    }
  }
  return found ? total : null;
}

async function runCase(
  benchmarkCase: BenchmarkCase,
  runId: string,
  model: string,
  reasoningEffort: string
): Promise<CaseResult> {
  const workspace = resolve(benchmarkRoot, "workspaces", runId, benchmarkCase.id);
  const rawDir = resolve(benchmarkRoot, "runs", runId, "raw", benchmarkCase.id);
  await mkdir(dirname(workspace), { recursive: true });
  await mkdir(rawDir, { recursive: true });
  await cp(resolve(benchmarkRoot, benchmarkCase.seedDir), workspace, {
    recursive: true,
    force: false
  });

  process.stderr.write(`[direct-v0] START ${benchmarkCase.id}\n`);
  let modelResult: CommandResult;
  try {
    modelResult = await runCommand(
      "codex",
      [
        "exec",
        "--json",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "--model",
        model,
        "-c",
        `model_reasoning_effort=\"${reasoningEffort}\"`,
        "--cd",
        workspace,
        "--output-last-message",
        resolve(rawDir, "final-message.txt"),
        benchmarkCase.prompt
      ],
      workspace,
      benchmarkCase.timeoutMs
    );
  } catch (error) {
    return {
      id: benchmarkCase.id,
      category: benchmarkCase.category,
      passed: false,
      modelExitCode: null,
      verifierExitCode: null,
      timedOut: false,
      modelLatencyMs: 0,
      verifierLatencyMs: 0,
      usage: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  await writeFile(resolve(rawDir, "events.jsonl"), modelResult.stdout);
  await writeFile(resolve(rawDir, "codex.log"), modelResult.stderr);

  let verifierResult: CommandResult | undefined;
  if (modelResult.exitCode === 0 && !modelResult.timedOut) {
    verifierResult = await runCommand(
      process.execPath,
      [resolve(benchmarkRoot, benchmarkCase.verifier.file), ...benchmarkCase.verifier.args],
      workspace,
      30000
    );
    await writeFile(
      resolve(rawDir, "verifier.log"),
      `${verifierResult.stdout}${verifierResult.stderr}`
    );
  }

  const passed =
    modelResult.exitCode === 0 &&
    !modelResult.timedOut &&
    verifierResult?.exitCode === 0 &&
    !verifierResult.timedOut;
  process.stderr.write(`[direct-v0] ${passed ? "PASS" : "FAIL"} ${benchmarkCase.id}\n`);
  return {
    id: benchmarkCase.id,
    category: benchmarkCase.category,
    passed,
    modelExitCode: modelResult.exitCode,
    verifierExitCode: verifierResult?.exitCode ?? null,
    timedOut: modelResult.timedOut || (verifierResult?.timedOut ?? false),
    modelLatencyMs: modelResult.latencyMs,
    verifierLatencyMs: verifierResult?.latencyMs ?? 0,
    usage: parseUsage(modelResult.stdout),
    error: passed
      ? null
      : verifierResult?.stderr.trim() || modelResult.stderr.trim() || "verification failed"
  };
}

function sumUsage(results: CaseResult[]): Usage | null {
  const usages = results.map((item) => item.usage).filter((item): item is Usage => item !== null);
  if (usages.length !== results.length) return null;
  return usages.reduce<Usage>(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      reasoningOutputTokens: total.reasoningOutputTokens + usage.reasoningOutputTokens
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 }
  );
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(benchmarkRoot, "manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = await loadManifest(manifestPath);
  const integrity = await benchmarkIntegrity(benchmarkRoot, manifestBytes, manifest);
  const selected =
    options.caseIds.length === 0
      ? manifest.cases
      : manifest.cases.filter((item) => options.caseIds.includes(item.id));
  if (
    selected.length === 0 ||
    (selected.length !== new Set(options.caseIds).size && options.caseIds.length > 0)
  ) {
    throw new Error("one or more selected benchmark cases do not exist");
  }
  const concurrency = options.concurrency ?? manifest.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error("concurrency must be a positive integer");
  const model = options.model ?? manifest.model;
  const runId = new Date().toISOString().replaceAll(/[-:.]/g, "");

  const results: CaseResult[] = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < selected.length) {
      const benchmarkCase = selected[nextIndex];
      nextIndex += 1;
      if (benchmarkCase !== undefined)
        results.push(await runCase(benchmarkCase, runId, model, manifest.reasoningEffort));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
  results.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  const codexVersion = await runCommand("codex", ["--version"], repoRoot, 10000);
  const environment = {
    nodeVersion: process.version,
    codexVersion: codexVersion.stdout.trim(),
    platform: process.platform,
    arch: process.arch,
    model,
    reasoningEffort: manifest.reasoningEffort,
    ...integrity
  };
  const summary = {
    schemaVersion: 1,
    benchmark: "direct-v0",
    generatedAt: new Date().toISOString(),
    environment,
    environmentDigest: createHash("sha256").update(JSON.stringify(environment)).digest("hex"),
    totals: {
      cases: results.length,
      passed: results.filter((item) => item.passed).length,
      failed: results.filter((item) => !item.passed).length,
      modelLatencyMs: {
        p50: percentile(
          results.map((item) => item.modelLatencyMs),
          0.5
        ),
        p95: percentile(
          results.map((item) => item.modelLatencyMs),
          0.95
        )
      },
      usage: sumUsage(results),
      costUsd: null,
      costReason:
        "The authenticated Codex subscription does not expose a dated per-run USD price in exec events."
    },
    results
  };
  const runSummaryPath = resolve(benchmarkRoot, "runs", runId, "summary.json");
  await mkdir(dirname(runSummaryPath), { recursive: true });
  await writeFile(runSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (selected.length === manifest.cases.length) {
    await writeFile(
      resolve(benchmarkRoot, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`
    );
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.totals.failed > 0) process.exitCode = 1;
}

await main();
