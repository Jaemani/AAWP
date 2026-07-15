import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalize, type WorkflowDefinition } from "@awf/ir";

export type TokenTrackingPolicy = "required" | "optional" | "none";

export interface LocalExecutionOutput {
  port: string;
  source: "file" | "stdout";
  path?: string;
}

export interface LocalExecutionStep {
  nodeId: string;
  command: string[];
  timeoutSec: number;
  tokenTracking: TokenTrackingPolicy;
  outputs: LocalExecutionOutput[];
}

export interface LocalExecutionManifest {
  schemaVersion: "aawp/local-execution-manifest/v1";
  workflowId: string;
  workingDirectory: string;
  steps: LocalExecutionStep[];
}

export interface StudioExecutionDescriptor {
  kind: "local-process";
  workflowId: string;
  workingDirectory: string;
  executionRoot: string;
  tokenTelemetry: "codex-jsonl+aawp-events";
  steps: Array<{
    nodeId: string;
    command: string[];
    timeoutSec: number;
    tokenTracking: TokenTrackingPolicy;
  }>;
}

export interface ModelUsageSample {
  nodeId: string;
  provider: string;
  model?: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface ExecutedArtifact {
  nodeId: string;
  port: string;
  source: "file" | "stdout";
  contentHash: string;
  path?: string;
}

export interface ExecutedStep {
  nodeId: string;
  command: string[];
  workingDirectory: string;
  startedOffsetMs: number;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutPath: string;
  stderrPath: string;
  usage: ModelUsageSample[];
  artifacts: ExecutedArtifact[];
}

export interface StudioExecutionResult {
  executionDirectory: string;
  inputPath: string;
  durationMs: number;
  steps: ExecutedStep[];
  outputs: Record<string, unknown>;
}

export type StudioExecutionProgressEvent =
  | { type: "executionPrepared"; executionDirectory: string; inputPath: string }
  | {
      type: "stepStarted";
      nodeId: string;
      command: string[];
      workingDirectory: string;
      startedOffsetMs: number;
    }
  | { type: "stepCompleted"; step: ExecutedStep }
  | {
      type: "stepFailed";
      nodeId: string;
      durationMs: number;
      exitCode: number;
      stdoutPath: string;
      stderrPath: string;
      usage: ModelUsageSample[];
      errorCode: StudioExecutionError["code"];
      message: string;
    };

export interface StudioWorkflowExecutor {
  readonly descriptor: StudioExecutionDescriptor;
  execute(input: {
    workflow: WorkflowDefinition;
    inputs: unknown;
    runId: string;
    onProgress?: (event: StudioExecutionProgressEvent) => void | Promise<void>;
  }): Promise<StudioExecutionResult>;
}

export class StudioExecutionManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioExecutionManifestError";
  }
}

export class StudioExecutionError extends Error {
  constructor(
    readonly code:
      | "EXECUTION_TIMEOUT"
      | "EXECUTION_PROCESS_FAILED"
      | "EXECUTION_OUTPUT_TOO_LARGE"
      | "EXECUTION_ARTIFACT_MISSING"
      | "MODEL_USAGE_MISSING",
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "StudioExecutionError";
  }
}

const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function roundMilliseconds(value: number): number {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

function parseOutput(raw: unknown, index: number): LocalExecutionOutput {
  if (
    !isRecord(raw) ||
    !nonEmptyString(raw.port) ||
    !["file", "stdout"].includes(String(raw.source))
  ) {
    throw new StudioExecutionManifestError(`invalid output at steps output ${index}`);
  }
  if (raw.source === "file" && !nonEmptyString(raw.path)) {
    throw new StudioExecutionManifestError(`file output ${raw.port} requires path`);
  }
  if (raw.source === "stdout" && raw.path !== undefined) {
    throw new StudioExecutionManifestError(`stdout output ${raw.port} cannot declare path`);
  }
  return {
    port: raw.port,
    source: raw.source as "file" | "stdout",
    ...(raw.path === undefined ? {} : { path: String(raw.path) })
  };
}

export function parseLocalExecutionManifest(
  raw: unknown,
  workflow: WorkflowDefinition
): LocalExecutionManifest {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== "aawp/local-execution-manifest/v1" ||
    raw.workflowId !== workflow.id ||
    !nonEmptyString(raw.workingDirectory) ||
    !Array.isArray(raw.steps)
  ) {
    throw new StudioExecutionManifestError("invalid local execution manifest header");
  }
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const steps = raw.steps.map((rawStep, index): LocalExecutionStep => {
    if (
      !isRecord(rawStep) ||
      !nonEmptyString(rawStep.nodeId) ||
      !Array.isArray(rawStep.command) ||
      rawStep.command.length === 0 ||
      !rawStep.command.every(nonEmptyString) ||
      !Number.isInteger(rawStep.timeoutSec) ||
      Number(rawStep.timeoutSec) < 1 ||
      !["required", "optional", "none"].includes(String(rawStep.tokenTracking)) ||
      !Array.isArray(rawStep.outputs)
    ) {
      throw new StudioExecutionManifestError(`invalid execution step ${index}`);
    }
    const node = nodes.get(rawStep.nodeId);
    if (node === undefined) {
      throw new StudioExecutionManifestError(
        `execution step references unknown node ${rawStep.nodeId}`
      );
    }
    if (seen.has(rawStep.nodeId)) {
      throw new StudioExecutionManifestError(`duplicate execution step ${rawStep.nodeId}`);
    }
    seen.add(rawStep.nodeId);
    const outputs = rawStep.outputs.map(parseOutput);
    const expectedPorts = Object.keys(node.outputs).sort();
    const actualPorts = outputs.map((output) => output.port).sort();
    if (canonicalize(expectedPorts) !== canonicalize(actualPorts)) {
      throw new StudioExecutionManifestError(
        `execution outputs for ${node.id} do not match WIR ports: expected ${expectedPorts.join(", ")}`
      );
    }
    const tokenTracking = rawStep.tokenTracking as TokenTrackingPolicy;
    if (node.kind === "llm" && tokenTracking !== "required") {
      throw new StudioExecutionManifestError(`llm node ${node.id} must require token tracking`);
    }
    return {
      nodeId: rawStep.nodeId,
      command: [...(rawStep.command as string[])],
      timeoutSec: Number(rawStep.timeoutSec),
      tokenTracking,
      outputs
    };
  });
  for (const nodeId of nodes.keys()) {
    if (!seen.has(nodeId)) {
      throw new StudioExecutionManifestError(`workflow node ${nodeId} has no executable step`);
    }
  }
  const workflowOrder = workflow.nodes.map((node) => node.id);
  const manifestOrder = steps.map((step) => step.nodeId);
  if (canonicalize(workflowOrder) !== canonicalize(manifestOrder)) {
    throw new StudioExecutionManifestError(
      `execution step order must match normalized WIR order: ${workflowOrder.join(" -> ")}`
    );
  }
  return {
    schemaVersion: "aawp/local-execution-manifest/v1",
    workflowId: workflow.id,
    workingDirectory: raw.workingDirectory,
    steps
  };
}

export async function loadLocalExecutionManifest(
  path: string,
  workflow: WorkflowDefinition
): Promise<LocalExecutionManifest> {
  const source = await readFile(resolve(path), "utf8");
  return parseLocalExecutionManifest(JSON.parse(source) as unknown, workflow);
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

async function runCommand(input: {
  command: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<CommandResult> {
  const [executable, ...args] = input.command;
  if (executable === undefined) throw new StudioExecutionManifestError("empty command");
  return new Promise((resolvePromise, reject) => {
    const startedAt = performance.now();
    const child = spawn(executable, args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let capturedBytes = 0;
    let timedOut = false;
    let tooLarge = false;
    const capture = (target: "stdout" | "stderr", chunk: Buffer): void => {
      capturedBytes += chunk.byteLength;
      if (capturedBytes > MAX_CAPTURE_BYTES) {
        tooLarge = true;
        child.kill("SIGTERM");
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
      if (tooLarge) {
        reject(
          new StudioExecutionError(
            "EXECUTION_OUTPUT_TOO_LARGE",
            `command output exceeded ${MAX_CAPTURE_BYTES} bytes`
          )
        );
        return;
      }
      resolvePromise({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
        timedOut,
        durationMs: roundMilliseconds(performance.now() - startedAt)
      });
    });
  });
}

function usageNumber(value: unknown): number {
  return nonNegativeInteger(value) ? value : 0;
}

function parseUsage(stdout: string, nodeId: string): ModelUsageSample[] {
  const samples: ModelUsageSample[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const value = JSON.parse(
        trimmed.startsWith("AAWP_EVENT ") ? trimmed.slice("AAWP_EVENT ".length) : trimmed
      ) as unknown;
      if (!isRecord(value)) continue;
      if (value.type === "turn.completed" && isRecord(value.usage)) {
        samples.push({
          nodeId,
          provider: "codex-cli",
          inputTokens: usageNumber(value.usage.input_tokens),
          cachedInputTokens: usageNumber(value.usage.cached_input_tokens),
          outputTokens: usageNumber(value.usage.output_tokens),
          reasoningOutputTokens: usageNumber(value.usage.reasoning_output_tokens)
        });
      }
      if (value.type === "model_usage") {
        samples.push({
          nodeId,
          provider: nonEmptyString(value.provider) ? value.provider : "unknown",
          ...(nonEmptyString(value.model) ? { model: value.model } : {}),
          inputTokens: usageNumber(value.inputTokens),
          cachedInputTokens: usageNumber(value.cachedInputTokens),
          outputTokens: usageNumber(value.outputTokens),
          reasoningOutputTokens: usageNumber(value.reasoningOutputTokens)
        });
      }
    } catch {
      // Non-JSON command output remains in the run log but is not token telemetry.
    }
  }
  return samples;
}

async function hashFile(path: string): Promise<string> {
  try {
    return createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new StudioExecutionError(
        "EXECUTION_ARTIFACT_MISSING",
        `declared execution artifact is missing: ${path}`
      );
    }
    throw error;
  }
}

export class LocalProcessWorkflowExecutor implements StudioWorkflowExecutor {
  readonly descriptor: StudioExecutionDescriptor;
  private readonly workingDirectory: string;
  private readonly executionRoot: string;

  constructor(
    private readonly manifest: LocalExecutionManifest,
    input: { executionRoot: string }
  ) {
    this.workingDirectory = resolve(manifest.workingDirectory);
    this.executionRoot = resolve(input.executionRoot);
    this.descriptor = {
      kind: "local-process",
      workflowId: manifest.workflowId,
      workingDirectory: this.workingDirectory,
      executionRoot: this.executionRoot,
      tokenTelemetry: "codex-jsonl+aawp-events",
      steps: manifest.steps.map((step) => ({
        nodeId: step.nodeId,
        command: [...step.command],
        timeoutSec: step.timeoutSec,
        tokenTracking: step.tokenTracking
      }))
    };
  }

  async execute(input: {
    workflow: WorkflowDefinition;
    inputs: unknown;
    runId: string;
    onProgress?: (event: StudioExecutionProgressEvent) => void | Promise<void>;
  }): Promise<StudioExecutionResult> {
    if (input.workflow.id !== this.manifest.workflowId) {
      throw new StudioExecutionManifestError(
        `executor ${this.manifest.workflowId} cannot run ${input.workflow.id}`
      );
    }
    const startedAt = performance.now();
    const executionDirectory = resolve(this.executionRoot, input.runId);
    const inputPath = resolve(executionDirectory, "input.json");
    await mkdir(this.executionRoot, { recursive: true });
    await mkdir(executionDirectory, { recursive: false });
    const logDirectory = resolve(executionDirectory, "logs");
    await mkdir(logDirectory, { recursive: false });
    await writeFile(inputPath, `${canonicalize(input.inputs)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await input.onProgress?.({ type: "executionPrepared", executionDirectory, inputPath });
    const steps: ExecutedStep[] = [];
    const outputs: Record<string, unknown> = {};
    for (const step of this.manifest.steps) {
      const startedOffsetMs = roundMilliseconds(performance.now() - startedAt);
      await input.onProgress?.({
        type: "stepStarted",
        nodeId: step.nodeId,
        command: [...step.command],
        workingDirectory: this.workingDirectory,
        startedOffsetMs
      });
      const result = await runCommand({
        command: step.command,
        cwd: this.workingDirectory,
        timeoutMs: step.timeoutSec * 1000,
        env: {
          ...process.env,
          AAWP_RUN_ID: input.runId,
          AAWP_WORKFLOW_ID: input.workflow.id,
          AAWP_NODE_ID: step.nodeId,
          AAWP_INPUT_PATH: inputPath,
          AAWP_EXECUTION_DIR: executionDirectory
        }
      });
      const logName = encodeURIComponent(step.nodeId);
      const stdoutPath = resolve(logDirectory, `${logName}.stdout.log`);
      const stderrPath = resolve(logDirectory, `${logName}.stderr.log`);
      await Promise.all([
        writeFile(stdoutPath, result.stdout, { encoding: "utf8", mode: 0o600 }),
        writeFile(stderrPath, result.stderr, { encoding: "utf8", mode: 0o600 })
      ]);
      const usage = parseUsage(result.stdout, step.nodeId);
      const fail = async (
        code: StudioExecutionError["code"],
        message: string,
        details?: unknown
      ): Promise<never> => {
        await input.onProgress?.({
          type: "stepFailed",
          nodeId: step.nodeId,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          stdoutPath,
          stderrPath,
          usage,
          errorCode: code,
          message
        });
        throw new StudioExecutionError(code, message, details);
      };
      if (result.timedOut) {
        return fail("EXECUTION_TIMEOUT", `${step.nodeId} exceeded ${step.timeoutSec}s`, {
          command: step.command
        });
      }
      if (result.exitCode !== 0) {
        return fail(
          "EXECUTION_PROCESS_FAILED",
          `${step.nodeId} exited with code ${result.exitCode}`,
          { command: step.command, stderr: result.stderr.slice(-8000) }
        );
      }
      if (step.tokenTracking === "required" && usage.length === 0) {
        return fail(
          "MODEL_USAGE_MISSING",
          `${step.nodeId} completed without required token telemetry`
        );
      }
      const artifacts: ExecutedArtifact[] = [];
      for (const output of step.outputs) {
        if (output.source === "stdout") {
          artifacts.push({
            nodeId: step.nodeId,
            port: output.port,
            source: "stdout",
            contentHash: createHash("sha256").update(result.stdout).digest("hex"),
            path: stdoutPath
          });
        } else {
          const absolutePath = resolve(this.workingDirectory, output.path!);
          artifacts.push({
            nodeId: step.nodeId,
            port: output.port,
            source: "file",
            path: absolutePath,
            contentHash: await hashFile(absolutePath)
          });
        }
      }
      const executedStep: ExecutedStep = {
        nodeId: step.nodeId,
        command: [...step.command],
        workingDirectory: this.workingDirectory,
        startedOffsetMs,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        stdoutPath,
        stderrPath,
        usage,
        artifacts
      };
      steps.push(executedStep);
      await input.onProgress?.({ type: "stepCompleted", step: executedStep });
      for (const artifact of artifacts) {
        outputs[artifact.port] = {
          artifactId: `artifact_${artifact.contentHash}`,
          nodeId: artifact.nodeId,
          contentHash: artifact.contentHash,
          source: artifact.source,
          ...(artifact.path === undefined ? {} : { path: artifact.path })
        };
      }
    }
    return {
      executionDirectory,
      inputPath,
      durationMs: roundMilliseconds(performance.now() - startedAt),
      steps,
      outputs
    };
  }
}
