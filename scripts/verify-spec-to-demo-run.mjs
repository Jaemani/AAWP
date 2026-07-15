import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = process.env.AAWP_INPUT_PATH;
if (!inputPath) throw new Error("AAWP_INPUT_PATH is required");

const input = JSON.parse(await readFile(inputPath, "utf8"));
const brief = input.brief;
assert.ok(brief && typeof brief === "object", "brief is required");
assert.ok(
  brief.demoArtifact && typeof brief.demoArtifact.path === "string",
  "brief.demoArtifact.path is required"
);
assert.ok(Array.isArray(brief.requestedScreens), "brief.requestedScreens is required");

const demoDirectory = resolve(brief.demoArtifact.path);
const [html, app, manifest] = await Promise.all([
  readFile(resolve(demoDirectory, "index.html"), "utf8"),
  readFile(resolve(demoDirectory, "app.js"), "utf8"),
  readFile(resolve(demoDirectory, "manifest.json"), "utf8").then(JSON.parse)
]);

assert.match(html, /app\.js/, "index.html must load app.js");
assert.ok(Array.isArray(manifest.screens), "manifest.screens must be an array");
const manifestScreenIds = new Set(manifest.screens.map((screen) => screen?.id));
for (const screenId of brief.requestedScreens) {
  assert.equal(typeof screenId, "string", "requested screen ID must be a string");
  assert.ok(manifestScreenIds.has(screenId), `manifest is missing requested screen ${screenId}`);
  assert.ok(app.includes(screenId), `app.js does not expose requested screen ${screenId}`);
}

const verdict = {
  schemaVersion: "aawp/verdict/v1",
  status: "passed",
  runId: process.env.AAWP_RUN_ID,
  workflowId: process.env.AAWP_WORKFLOW_ID,
  verifierNodeId: process.env.AAWP_NODE_ID,
  demoDirectory,
  requestedScreens: brief.requestedScreens.length,
  manifestScreens: manifest.screens.length
};
process.stdout.write(`${JSON.stringify(verdict)}\n`);
