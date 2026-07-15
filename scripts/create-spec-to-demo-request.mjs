#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

function values(name) {
  const result = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1])
      result.push(process.argv[index + 1]);
  }
  return result;
}

function value(name) {
  return values(name).at(-1);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

const sourceArgument = value("--source");
const requestedScreens = values("--screen");
const requestText = value("--request");
if (!sourceArgument || requestedScreens.length === 0 || !requestText) {
  throw new Error(
    "usage: node scripts/create-spec-to-demo-request.mjs --source <spec.json> --screen <id> [--screen <id>] --request <text> [--id <request-id>]"
  );
}

const root = process.cwd();
const sourcePath = resolve(sourceArgument);
const sourceBytes = await readFile(sourcePath);
const source = JSON.parse(sourceBytes.toString("utf8"));
if (!Array.isArray(source.screens)) throw new Error("source spec must contain screens[]");
const available = new Set(source.screens.map((screen) => screen?.id));
for (const screenId of requestedScreens) {
  if (!available.has(screenId)) throw new Error(`source spec has no requested screen: ${screenId}`);
}

const designPath = resolve(root, "DESIGN.md");
const designBytes = await readFile(designPath);
const version = designBytes.toString("utf8").match(/^- 버전:\s*([^\s]+)$/m)?.[1];
if (!version) throw new Error("DESIGN.md has no version field");

const generatedId = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14);
const requestId = value("--id") ?? `spec-to-demo-${generatedId}`;
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(requestId)) throw new Error("invalid request ID");
const requestDirectory = resolve(root, "runs", "requests", requestId);
await mkdir(resolve(root, "runs", "requests"), { recursive: true });
await mkdir(requestDirectory, { recursive: false });
const pinnedSourcePath = resolve(requestDirectory, "source-spec.json");
await copyFile(sourcePath, pinnedSourcePath);

const request = {
  brief: {
    schemaVersion: "aawp/spec-to-demo-brief/v1",
    requestText,
    sourceSpec: {
      path: relative(root, pinnedSourcePath),
      originalFilename: basename(sourcePath),
      byteSha256: sha256(sourceBytes)
    },
    designContract: {
      path: "DESIGN.md",
      version,
      byteSha256: sha256(designBytes)
    },
    requestedScreens,
    demoArtifact: { relativePath: "artifacts/demo" }
  }
};
const requestPath = resolve(requestDirectory, "request.json");
await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600
});
process.stdout.write(
  `${JSON.stringify({ ok: true, requestId, requestPath, sourceSpec: request.brief.sourceSpec, designContract: request.brief.designContract })}\n`
);
