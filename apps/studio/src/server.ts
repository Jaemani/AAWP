#!/usr/bin/env node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
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
  executeStudioRun,
  InMemoryStudioRunStore,
  JsonlStudioRunStore,
  type StudioRunStore
} from "./run-store.js";
import { createStudioView, renderStudioHtml } from "./studio.js";

export interface StudioServerOptions {
  document: WorkflowEditorDocument;
  runStore?: StudioRunStore;
  initialInputs?: unknown;
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
  const html = renderStudioHtml(
    createStudioView({
      document: options.document,
      initialInputs: options.initialInputs ?? {}
    })
  );
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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
    if (request.method === "GET" && url.pathname === "/api/runs") {
      sendJson(response, 200, { runs: await runStore.list() });
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const runId = decodeURIComponent(url.pathname.slice("/api/runs/".length));
      const record = await runStore.get(runId);
      sendJson(
        response,
        record === undefined ? 404 : 200,
        record === undefined ? { error: "run_not_found" } : record
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/runs") {
      try {
        const body = JSON.parse(await readBody(request)) as unknown;
        const inputs =
          typeof body === "object" && body !== null && "inputs" in body
            ? (body as { inputs: unknown }).inputs
            : body;
        const record = await executeStudioRun({
          workflow: options.document.workflow,
          inputs,
          store: runStore
        });
        sendJson(response, 201, record);
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
      "usage: awf-studio --workflow <workflow.json|workflow.yaml> [--input fixture.json] [--runs .awf/studio-runs.jsonl] [--port 4173]"
    );
  }
  const portValue = argument("--port") ?? "4173";
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`invalid port ${portValue}`);
  const document = await loadWorkflowDocument(workflowPath);
  const inputPath = argument("--input");
  const initialInputs = inputPath === undefined ? {} : await loadStudioInputs(inputPath);
  const runStore = new JsonlStudioRunStore(resolve(argument("--runs") ?? ".awf/studio-runs.jsonl"));
  const host = "127.0.0.1";
  createStudioServer({ document, runStore, initialInputs }).listen(port, host, () => {
    process.stdout.write(`AWF Studio loaded at http://${host}:${port}\n`);
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
