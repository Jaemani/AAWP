#!/usr/bin/env node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

export interface StudioServerOptions {
  document: WorkflowEditorDocument;
  runStore?: StudioRunStore;
  demoStore?: StudioDemoStore;
  initialInputs?: unknown;
  executor?: StudioWorkflowExecutor;
}

async function projectDemoLifecycle(
  record: StudioRunRecord | StudioRunSummary,
  demoStore: StudioDemoStore | undefined
): Promise<unknown> {
  if (record.demo === undefined) return record;
  const snapshotAvailable = (await demoStore?.exists(record.runId)) ?? false;
  const onboarded = snapshotAvailable && ((await demoStore?.isOnboarded(record.runId)) ?? false);
  return {
    ...record,
    demo: {
      ...record.demo,
      snapshotAvailable,
      onboarded,
      previewUrl: `/runs/${encodeURIComponent(record.runId)}/demo-preview/`
    }
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
  const activeRunIds = new Set<string>();
  const html = renderStudioHtml(
    createStudioView({
      document: options.document,
      initialInputs: options.initialInputs ?? {},
      ...(options.executor === undefined ? {} : { execution: options.executor.descriptor })
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
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; connect-src 'self'; frame-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      });
      response.end(html);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/workflow") {
      sendJson(response, 200, {
        digest: options.document.digest,
        canonicalJson: options.document.canonicalJson
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/execution") {
      sendJson(
        response,
        200,
        options.executor === undefined
          ? {
              executable: false,
              reason: "NO_EXECUTION_MANIFEST",
              message: "This workflow has no registered executor. Studio will not simulate it."
            }
          : { executable: true, descriptor: options.executor.descriptor }
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/runs") {
      const summaries = await runStore.list();
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
      if (record.status !== "completed") {
        sendJson(response, 409, {
          error: "demo_not_releasable",
          message: "실패한 run의 candidate는 inspection만 가능하며 onboard할 수 없습니다."
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
        if (options.executor === undefined) {
          sendJson(response, 409, {
            ok: false,
            code: "WORKFLOW_NOT_EXECUTABLE",
            message:
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
        const body = JSON.parse(await readBody(request)) as unknown;
        const inputs =
          typeof body === "object" && body !== null && "inputs" in body
            ? (body as { inputs: unknown }).inputs
            : body;
        const runId = `run_${randomUUID()}`;
        let notifyStarted!: (record: StudioRunRecord) => void;
        const started = new Promise<StudioRunRecord>((resolveStarted) => {
          notifyStarted = resolveStarted;
        });
        activeRunIds.add(runId);
        const completion = executeStudioProcessRun({
          workflow: options.document.workflow,
          inputs,
          store: runStore,
          executor: options.executor,
          runId,
          onStarted: notifyStarted,
          ...(demoStore === undefined
            ? {}
            : { createDemoSnapshot: (runId) => demoStore.createSnapshot(runId) })
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
  if (workflowPath === undefined) {
    throw new Error(
      "usage: awf-studio --workflow <workflow.json|workflow.yaml> [--executor execution.json] [--input fixture.json] [--runs runs/history.jsonl] [--demo-source runs/{runId}/artifacts/demo] [--demo-root runs] [--execution-root runs] [--port 4173]"
    );
  }
  const portValue = argument("--port") ?? "4173";
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`invalid port ${portValue}`);
  const document = await loadWorkflowDocument(workflowPath);
  const inputPath = argument("--input");
  const initialInputs = inputPath === undefined ? {} : await loadStudioInputs(inputPath);
  const executorPath = argument("--executor");
  const executor =
    executorPath === undefined
      ? undefined
      : new LocalProcessWorkflowExecutor(
          await loadLocalExecutionManifest(executorPath, document.workflow),
          { executionRoot: resolve(argument("--execution-root") ?? "runs") }
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
