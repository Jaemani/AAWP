#!/usr/bin/env node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createWorkflowEditorDocument,
  parseWorkflowEditorDocument,
  WorkflowDocumentError,
  type WorkflowEditorDocument
} from "@awf/control-plane";
import { parse as parseYaml } from "yaml";
import {
  executeStudioProcessRun,
  InMemoryStudioRunStore,
  JsonlStudioRunStore,
  type StudioRunRecord,
  type StudioRunSummary,
  type StudioRunStore
} from "./run-store.js";
import { LocalStudioDemoStore, type StudioDemoStore } from "./demo-store.js";
import { createStudioView, renderStudioHtml } from "./studio.js";
import {
  loadLocalExecutionManifest,
  LocalProcessWorkflowExecutor,
  type StudioWorkflowExecutor
} from "./executor.js";
import { prepareSpecToDemoRequest, type SpecToDemoLauncherInput } from "./spec-to-demo-request.js";
import {
  prepareSpecFeedbackRequest,
  type SpecFeedbackLauncherInput
} from "./spec-feedback-request.js";

export type StudioInputKind = "json" | "spec-to-demo" | "spec-feedback-to-spec";

export interface StudioWorkflowRegistration {
  document: WorkflowEditorDocument;
  displayName: string;
  description: string;
  inputKind: StudioInputKind;
  initialInputs?: unknown;
  executor?: StudioWorkflowExecutor;
  projectRoot?: string;
  unavailableReason?: string;
}

export interface StudioServerOptions {
  document: WorkflowEditorDocument;
  runStore?: StudioRunStore;
  demoStore?: StudioDemoStore;
  initialInputs?: unknown;
  executor?: StudioWorkflowExecutor;
  workflows?: StudioWorkflowRegistration[];
}

interface StudioCatalogFile {
  schemaVersion: "aawp/studio-workflow-catalog/v1";
  workflows: Array<{
    workflowPath: string;
    executionManifestPath?: string;
    displayName: string;
    description: string;
    inputKind: StudioInputKind;
    unavailableReason?: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkflowRegistrations(
  options: StudioServerOptions
): StudioWorkflowRegistration[] {
  const registrations = options.workflows ?? [
    {
      document: options.document,
      displayName: options.document.workflow.id,
      description: `${options.document.workflow.id} workflow`,
      inputKind: "json" as const,
      ...(options.initialInputs === undefined ? {} : { initialInputs: options.initialInputs }),
      ...(options.executor === undefined ? {} : { executor: options.executor })
    }
  ];
  if (registrations.length === 0) throw new Error("Studio workflow catalog is empty");
  const ids = new Set<string>();
  for (const registration of registrations) {
    const id = registration.document.workflow.id;
    if (ids.has(id)) throw new Error(`duplicate Studio workflow: ${id}`);
    ids.add(id);
    if (registration.executor !== undefined && registration.executor.descriptor.workflowId !== id) {
      throw new Error(`Studio executor does not match workflow ${id}`);
    }
  }
  return registrations;
}

export async function loadStudioWorkflowCatalog(input: {
  path: string;
  executionRoot: string;
  projectRoot?: string;
}): Promise<StudioWorkflowRegistration[]> {
  const projectRoot = resolve(input.projectRoot ?? ".");
  const raw = JSON.parse(await readFile(resolve(input.path), "utf8")) as unknown;
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== "aawp/studio-workflow-catalog/v1" ||
    !Array.isArray(raw.workflows) ||
    raw.workflows.length === 0
  ) {
    throw new Error("invalid Studio workflow catalog");
  }
  const catalog = raw as unknown as StudioCatalogFile;
  const registrations: StudioWorkflowRegistration[] = [];
  for (const [index, entry] of catalog.workflows.entries()) {
    if (
      !isRecord(entry) ||
      typeof entry.workflowPath !== "string" ||
      typeof entry.displayName !== "string" ||
      typeof entry.description !== "string" ||
      (entry.executionManifestPath !== undefined &&
        typeof entry.executionManifestPath !== "string") ||
      (entry.unavailableReason !== undefined && typeof entry.unavailableReason !== "string") ||
      !["json", "spec-to-demo", "spec-feedback-to-spec"].includes(String(entry.inputKind))
    ) {
      throw new Error(`invalid Studio workflow catalog entry ${index}`);
    }
    const document = await loadWorkflowDocument(resolve(projectRoot, entry.workflowPath));
    const executor =
      entry.executionManifestPath === undefined
        ? undefined
        : new LocalProcessWorkflowExecutor(
            await loadLocalExecutionManifest(
              resolve(projectRoot, entry.executionManifestPath),
              document.workflow
            ),
            { executionRoot: resolve(input.executionRoot) }
          );
    registrations.push({
      document,
      displayName: entry.displayName,
      description: entry.description,
      inputKind: entry.inputKind,
      projectRoot,
      ...(executor === undefined ? {} : { executor }),
      ...(entry.unavailableReason === undefined
        ? {}
        : { unavailableReason: entry.unavailableReason })
    });
  }
  return registrations;
}

async function projectDemoLifecycle(
  record: StudioRunRecord | StudioRunSummary,
  demoStore: StudioDemoStore | undefined
): Promise<unknown> {
  const reverification = await latestDemoReverification(record);
  const projectedRecord = reverification === undefined ? record : { ...record, reverification };
  if (record.demo === undefined) return projectedRecord;
  const snapshotAvailable = (await demoStore?.exists(record.runId)) ?? false;
  const onboarded = snapshotAvailable && ((await demoStore?.isOnboarded(record.runId)) ?? false);
  return {
    ...projectedRecord,
    demo: {
      ...record.demo,
      snapshotAvailable,
      onboarded,
      previewUrl: `/runs/${encodeURIComponent(record.runId)}/demo-preview/`
    }
  };
}

interface DemoReverificationSummary {
  attemptId: string;
  status: "passed" | "failed";
  completedAt: string;
  durationMs: number;
  verifierWorkflowVersion: string;
  evidenceCheckCount: number;
}

export async function latestDemoReverification(
  record: StudioRunRecord | StudioRunSummary
): Promise<DemoReverificationSummary | undefined> {
  if (!("executor" in record) || record.executor === undefined) return undefined;
  const root = resolve(record.executor.executionDirectory, "..", "reverifications");
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
  const reports = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return JSON.parse(
            await readFile(resolve(root, entry.name, "verdict.json"), "utf8")
          ) as unknown;
        } catch {
          return undefined;
        }
      })
  );
  const matching = reports
    .filter(
      (report): report is Record<string, unknown> =>
        isRecord(report) &&
        report.sourceRunId === record.runId &&
        report.inputDigest === record.inputDigest &&
        report.sourceWorkflowVersion === record.workflowVersion &&
        (record.demo === undefined || report.snapshotContentDigest === record.demo.contentDigest) &&
        (report.status === "passed" || report.status === "failed") &&
        typeof report.completedAt === "string"
    )
    .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));
  const report = matching[0];
  if (report === undefined) return undefined;
  const verdict = isRecord(report.verdict) ? report.verdict : {};
  const maturity = isRecord(verdict.maturity) ? verdict.maturity : {};
  return {
    attemptId: String(report.attemptId),
    status: report.status as "passed" | "failed",
    completedAt: String(report.completedAt),
    durationMs: typeof report.durationMs === "number" ? report.durationMs : 0,
    verifierWorkflowVersion: String(report.verifierWorkflowVersion ?? "unknown"),
    evidenceCheckCount: Array.isArray(maturity.evidenceCheckIds)
      ? maturity.evidenceCheckIds.length
      : 0
  };
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2 * 1024 * 1024) throw new Error("candidate body exceeds 2 MiB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function loadWorkflowDocument(path: string): Promise<WorkflowEditorDocument> {
  const absolutePath = resolve(path);
  const source = await readFile(absolutePath, "utf8");
  if ([".yaml", ".yml"].includes(extname(absolutePath).toLowerCase())) {
    return createWorkflowEditorDocument(parseYaml(source) as unknown);
  }
  return parseWorkflowEditorDocument(source);
}

export async function loadStudioInputs(path: string): Promise<unknown> {
  const absolutePath = resolve(path);
  const source = await readFile(absolutePath, "utf8");
  return [".yaml", ".yml"].includes(extname(absolutePath).toLowerCase())
    ? (parseYaml(source) as unknown)
    : (JSON.parse(source) as unknown);
}

export function createStudioServer(options: StudioServerOptions): Server {
  const runStore = options.runStore ?? new InMemoryStudioRunStore();
  const demoStore = options.demoStore;
  const workflows = normalizeWorkflowRegistrations(options);
  const defaultWorkflowId = options.document.workflow.id;
  const workflowById = new Map(
    workflows.map((registration) => [registration.document.workflow.id, registration])
  );
  const defaultWorkflow = workflowById.get(defaultWorkflowId) ?? workflows[0]!;
  const activeRunIds = new Set<string>();
  const registrationFor = (workflowId: string | null): StudioWorkflowRegistration | undefined =>
    workflowId === null ? defaultWorkflow : workflowById.get(workflowId);
  const viewFor = (registration: StudioWorkflowRegistration): string =>
    renderStudioHtml(
      createStudioView({
        document: registration.document,
        initialInputs: registration.initialInputs ?? {},
        inputKind: registration.inputKind,
        displayName: registration.displayName,
        description: registration.description,
        ...(registration.unavailableReason === undefined
          ? {}
          : { unavailableReason: registration.unavailableReason }),
        workflows: workflows.map((entry) => ({
          id: entry.document.workflow.id,
          version: entry.document.workflow.version,
          mode: entry.document.workflow.mode,
          displayName: entry.displayName,
          description: entry.description,
          executable: entry.executor !== undefined,
          ...(entry.unavailableReason === undefined
            ? {}
            : { unavailableReason: entry.unavailableReason })
        })),
        ...(registration.executor === undefined
          ? {}
          : { execution: registration.executor.descriptor })
      })
    );
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const demoRoute = url.pathname.match(/^\/runs\/([^/]+)\/(demo|demo-preview)(?:\/(.*))?$/);
    if (["GET", "HEAD"].includes(request.method ?? "") && demoRoute !== null) {
      const runId = decodeURIComponent(demoRoute[1] ?? "");
      if (!/^run_[A-Za-z0-9-]+$/.test(runId)) {
        sendJson(response, 404, { error: "demo_not_found" });
        return;
      }
      const record = await runStore.get(runId);
      const asset =
        record?.demo === undefined || demoStore === undefined
          ? undefined
          : demoRoute[2] === "demo-preview"
            ? await demoStore.readPreview(runId, demoRoute[3] ?? "")
            : await demoStore.read(runId, demoRoute[3] ?? "");
      if (asset === undefined) {
        sendJson(response, 404, { error: "demo_not_found" });
        return;
      }
      response.writeHead(200, {
        "content-type": asset.mediaType,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      response.end(request.method === "HEAD" ? undefined : asset.content);
      return;
    }
    if (request.method === "GET" && url.pathname === "/") {
      let registration = registrationFor(url.searchParams.get("workflow"));
      const requestedRunId = url.searchParams.get("run");
      if (url.searchParams.get("workflow") === null && requestedRunId !== null) {
        const record = await runStore.get(requestedRunId);
        if (record !== undefined) registration = workflowById.get(record.workflowId);
      }
      if (registration === undefined) {
        sendJson(response, 404, { error: "workflow_not_found" });
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; connect-src 'self'; frame-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      });
      response.end(viewFor(registration));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/workflows") {
      sendJson(response, 200, {
        workflows: workflows.map((registration) => ({
          id: registration.document.workflow.id,
          version: registration.document.workflow.version,
          mode: registration.document.workflow.mode,
          displayName: registration.displayName,
          description: registration.description,
          inputKind: registration.inputKind,
          executable: registration.executor !== undefined,
          ...(registration.unavailableReason === undefined
            ? {}
            : { unavailableReason: registration.unavailableReason })
        }))
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/workflow") {
      const registration = registrationFor(url.searchParams.get("workflow"));
      if (registration === undefined) {
        sendJson(response, 404, { error: "workflow_not_found" });
        return;
      }
      sendJson(response, 200, {
        digest: registration.document.digest,
        canonicalJson: registration.document.canonicalJson
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/execution") {
      const registration = registrationFor(url.searchParams.get("workflow"));
      if (registration === undefined) {
        sendJson(response, 404, { error: "workflow_not_found" });
        return;
      }
      sendJson(
        response,
        200,
        registration.executor === undefined
          ? {
              executable: false,
              reason: "NO_EXECUTION_MANIFEST",
              message:
                registration.unavailableReason ??
                "This workflow has no registered executor. Studio will not simulate it."
            }
          : { executable: true, descriptor: registration.executor.descriptor }
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/runs") {
      const registration = registrationFor(url.searchParams.get("workflow"));
      if (registration === undefined) {
        sendJson(response, 404, { error: "workflow_not_found" });
        return;
      }
      const summaries = (await runStore.list()).filter(
        (summary) => summary.workflowId === registration.document.workflow.id
      );
      sendJson(response, 200, {
        runs: await Promise.all(
          summaries.map(async (summary) => projectDemoLifecycle(summary, demoStore))
        )
      });
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const runId = decodeURIComponent(url.pathname.slice("/api/runs/".length));
      const storedRecord = await runStore.get(runId);
      const record =
        storedRecord === undefined
          ? undefined
          : await projectDemoLifecycle(storedRecord, demoStore);
      sendJson(
        response,
        record === undefined ? 404 : 200,
        record === undefined ? { error: "run_not_found" } : record
      );
      return;
    }
    const lifecycleRoute = url.pathname.match(/^\/api\/runs\/([^/]+)\/demo\/(onboard|offboard)$/);
    if (request.method === "POST" && lifecycleRoute !== null) {
      const runId = decodeURIComponent(lifecycleRoute[1] ?? "");
      const action = lifecycleRoute[2];
      const record = await runStore.get(runId);
      if (record === undefined) {
        sendJson(response, 404, { error: "run_not_found" });
        return;
      }
      const reverification = await latestDemoReverification(record);
      if (record.status !== "completed" && reverification?.status !== "passed") {
        sendJson(response, 409, {
          error: "demo_not_releasable",
          message:
            "실패한 run의 candidate는 current verifier reverify를 통과하기 전까지 onboard할 수 없습니다."
        });
        return;
      }
      if (
        record.demo === undefined ||
        demoStore === undefined ||
        !(await demoStore.exists(runId))
      ) {
        sendJson(response, 404, { error: "demo_not_found" });
        return;
      }
      const changed =
        action === "onboard" ? await demoStore.onboard(runId) : await demoStore.offboard(runId);
      sendJson(response, 200, {
        ok: true,
        runId,
        changed,
        snapshotAvailable: true,
        onboarded: await demoStore.isOnboarded(runId)
      });
      return;
    }
    if (
      request.method === "DELETE" &&
      url.pathname.startsWith("/api/runs/") &&
      url.pathname.endsWith("/demo")
    ) {
      const runId = decodeURIComponent(url.pathname.slice("/api/runs/".length, -"/demo".length));
      const record = await runStore.get(runId);
      if (record === undefined) {
        sendJson(response, 404, { error: "run_not_found" });
        return;
      }
      const deleted = (await demoStore?.delete(runId)) ?? false;
      sendJson(response, 200, { ok: true, runId, deleted });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/runs") {
      try {
        const body = JSON.parse(await readBody(request)) as unknown;
        const requestedWorkflowId =
          isRecord(body) && typeof body.workflowId === "string" ? body.workflowId : null;
        const registration = registrationFor(requestedWorkflowId);
        if (registration === undefined) {
          sendJson(response, 404, {
            ok: false,
            code: "WORKFLOW_NOT_FOUND",
            message: `등록되지 않은 workflow입니다: ${requestedWorkflowId ?? ""}`
          });
          return;
        }
        if (registration.executor === undefined) {
          sendJson(response, 409, {
            ok: false,
            code: "WORKFLOW_NOT_EXECUTABLE",
            message:
              registration.unavailableReason ??
              "이 workflow에는 실제 실행기가 등록되지 않았습니다. Studio는 simulation run을 생성하지 않습니다."
          });
          return;
        }
        if (activeRunIds.size > 0) {
          sendJson(response, 409, {
            ok: false,
            code: "WORKFLOW_ALREADY_RUNNING",
            message: `이미 실행 중인 workflow가 있습니다: ${[...activeRunIds][0]}`
          });
          return;
        }
        let inputs: unknown;
        if (registration.inputKind === "spec-to-demo") {
          if (!isRecord(body) || !("launcher" in body) || !isRecord(body.launcher)) {
            throw new Error("spec-to-demo는 구조화 launcher input이 필요합니다.");
          }
          const screenIds = Array.isArray(body.launcher.screenIds)
            ? body.launcher.screenIds.filter((item): item is string => typeof item === "string")
            : [];
          const prepared = await prepareSpecToDemoRequest({
            projectRoot: registration.projectRoot ?? ".",
            launcher: {
              sourcePath:
                typeof body.launcher.sourcePath === "string" ? body.launcher.sourcePath : "",
              screenIds,
              ...(typeof body.launcher.entryScreenId === "string"
                ? { entryScreenId: body.launcher.entryScreenId }
                : {}),
              requestText:
                typeof body.launcher.requestText === "string" ? body.launcher.requestText : ""
            } satisfies SpecToDemoLauncherInput
          });
          inputs = prepared.inputs;
        } else if (registration.inputKind === "spec-feedback-to-spec") {
          if (!isRecord(body) || !("launcher" in body) || !isRecord(body.launcher)) {
            throw new Error("spec-feedback-to-spec는 구조화 launcher input이 필요합니다.");
          }
          const prepared = await prepareSpecFeedbackRequest({
            projectRoot: registration.projectRoot ?? ".",
            launcher: {
              sourcePath:
                typeof body.launcher.sourcePath === "string" ? body.launcher.sourcePath : "",
              feedbackPath:
                typeof body.launcher.feedbackPath === "string" ? body.launcher.feedbackPath : "",
              requestText:
                typeof body.launcher.requestText === "string" ? body.launcher.requestText : "",
              targetMaturity: body.launcher.targetMaturity === "S2" ? "S2" : "S1",
              ...(typeof body.launcher.baseRunId === "string"
                ? { baseRunId: body.launcher.baseRunId }
                : {})
            } satisfies SpecFeedbackLauncherInput
          });
          inputs = prepared.inputs;
        } else {
          inputs = isRecord(body) && "inputs" in body ? body.inputs : body;
        }
        const runId = `run_${randomUUID()}`;
        let notifyStarted!: (record: StudioRunRecord) => void;
        const started = new Promise<StudioRunRecord>((resolveStarted) => {
          notifyStarted = resolveStarted;
        });
        activeRunIds.add(runId);
        const producesDemo =
          demoStore !== undefined &&
          (options.workflows === undefined || registration.inputKind === "spec-to-demo");
        const completion = executeStudioProcessRun({
          workflow: registration.document.workflow,
          inputs,
          store: runStore,
          executor: registration.executor,
          runId,
          onStarted: notifyStarted,
          ...(producesDemo
            ? { createDemoSnapshot: (runId) => demoStore.createSnapshot(runId) }
            : {})
        });
        void completion.then(
          () => activeRunIds.delete(runId),
          () => activeRunIds.delete(runId)
        );
        const record = await Promise.race([started, completion]);
        sendJson(
          response,
          record.status === "running" ? 202 : record.status === "completed" ? 201 : 400,
          await projectDemoLifecycle(record, demoStore)
        );
      } catch (error) {
        sendJson(response, 400, { ok: false, message: (error as Error).message });
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/check") {
      try {
        const candidate = parseWorkflowEditorDocument(await readBody(request));
        sendJson(response, 200, {
          ok: true,
          digest: candidate.digest,
          canonicalJson: candidate.canonicalJson
        });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          message: (error as Error).message,
          ...(error instanceof WorkflowDocumentError ? { diagnostics: error.diagnostics } : {})
        });
      }
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  });
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const workflowPath = argument("--workflow");
  const catalogPath = argument("--catalog");
  if (workflowPath === undefined && catalogPath === undefined) {
    throw new Error(
      "usage: awf-studio (--catalog workflows/catalog.json | --workflow workflow.yaml) [--executor execution.json] [--input fixture.json] [--runs runs/history.jsonl] [--demo-source runs/{runId}/artifacts/demo] [--demo-root runs] [--execution-root runs] [--port 4173]"
    );
  }
  const portValue = argument("--port") ?? "4173";
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`invalid port ${portValue}`);
  const executionRoot = resolve(argument("--execution-root") ?? "runs");
  const workflowRegistrations =
    catalogPath === undefined
      ? undefined
      : await loadStudioWorkflowCatalog({ path: catalogPath, executionRoot });
  const document =
    workflowRegistrations?.[0]?.document ?? (await loadWorkflowDocument(workflowPath!));
  const inputPath = argument("--input");
  const initialInputs = inputPath === undefined ? {} : await loadStudioInputs(inputPath);
  const executorPath = argument("--executor");
  const executor =
    workflowRegistrations !== undefined || executorPath === undefined
      ? undefined
      : new LocalProcessWorkflowExecutor(
          await loadLocalExecutionManifest(executorPath, document.workflow),
          { executionRoot }
        );
  const runStore = new JsonlStudioRunStore(resolve(argument("--runs") ?? "runs/history.jsonl"));
  const demoSource = argument("--demo-source");
  const demoStore = new LocalStudioDemoStore({
    rootDirectory: resolve(argument("--demo-root") ?? "runs"),
    ...(demoSource === undefined ? {} : { sourceDirectory: resolve(demoSource) })
  });
  const host = "127.0.0.1";
  createStudioServer({
    document,
    runStore,
    demoStore,
    initialInputs,
    ...(workflowRegistrations === undefined ? {} : { workflows: workflowRegistrations }),
    ...(executor === undefined ? {} : { executor })
  }).listen(port, host, () => {
    process.stdout.write(`AAWP Studio loaded at http://${host}:${port}\n`);
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
