import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const caseId = process.argv[2];
const cwd = process.cwd();
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function text(path) {
  return readFile(resolve(cwd, path), "utf8");
}

async function json(path) {
  return JSON.parse(await text(path));
}

function typecheck() {
  execFileSync(resolve(repoRoot, "node_modules/.bin/tsc"), ["--noEmit"], {
    cwd,
    stdio: "pipe"
  });
}

function runTypeScript(source) {
  execFileSync(resolve(repoRoot, "node_modules/.bin/tsx"), ["--eval", source], {
    cwd,
    stdio: "pipe"
  });
}

async function verifySmallEditCopy() {
  assert.equal(await text("message.txt"), "Release candidate ready.\n");
  assert.deepEqual(await readdir(cwd), ["message.txt"]);
}

async function verifySmallEditConfig() {
  assert.deepEqual(await json("config.json"), {
    service: "artifact-api",
    timeoutSeconds: 45,
    retries: 2
  });
  assert.deepEqual(await readdir(cwd), ["config.json"]);
}

async function verifySmallEditSlug() {
  const module = await import(`${pathToFileURL(resolve(cwd, "src/slug.js")).href}?v=${Date.now()}`);
  assert.equal(module.slugify("  Hello World  "), "hello-world");
  assert.equal(module.slugify("Already--Slug"), "already--slug");
}

async function verifyCoupledOrderTotal() {
  typecheck();
  runTypeScript(`
    import assert from "node:assert/strict";
    import { totalCents } from "./src/index.ts";
    assert.equal(totalCents({ lines: [{ unitPriceCents: 999, quantity: 2 }] }), 1998);
    assert.equal(totalCents({ lines: [{ unitPriceCents: 999, quantity: 2 }], couponPercent: 25 }), 1499);
    assert.throws(() => totalCents({ lines: [], couponPercent: -1 }), RangeError);
    assert.throws(() => totalCents({ lines: [], couponPercent: 10.5 }), RangeError);
    assert.throws(() => totalCents({ lines: [], couponPercent: 101 }), RangeError);
  `);
}

async function verifyCoupledUserDisplay() {
  typecheck();
  runTypeScript(`
    import assert from "node:assert/strict";
    import { displayName } from "./src/index.ts";
    assert.equal(displayName({ firstName: "Ada", lastName: "Lovelace" }), "Ada Lovelace");
    assert.equal(displayName({ firstName: "Ada", lastName: "Lovelace", preferredName: "  Countess  " }), "Countess");
    assert.equal(displayName({ firstName: "Ada", lastName: "Lovelace", preferredName: "   " }), "Ada Lovelace");
  `);
}

async function verifyCoupledTicketState() {
  typecheck();
  runTypeScript(`
    import assert from "node:assert/strict";
    import { canTransition } from "./src/index.ts";
    assert.equal(canTransition("open", "in_progress"), true);
    assert.equal(canTransition("in_progress", "closed"), true);
    assert.equal(canTransition("open", "closed"), false);
    assert.equal(canTransition("open", "open"), false);
    assert.equal(canTransition("closed", "open"), false);
  `);
}

async function verifyGenerateDurationParser() {
  typecheck();
  runTypeScript(`
    import assert from "node:assert/strict";
    import { parseDurationMs } from "./src/parse-duration.ts";
    assert.equal(parseDurationMs("1ms"), 1);
    assert.equal(parseDurationMs("12s"), 12000);
    assert.equal(parseDurationMs("3m"), 180000);
    for (const value of ["0s", "-1s", "1.5s", " 1s", "1s ", "1h", "x", "9007199254740991m"]) {
      assert.throws(() => parseDurationMs(value), RangeError);
    }
  `);
}

async function verifyGenerateAccessPolicy() {
  typecheck();
  runTypeScript(`
    import assert from "node:assert/strict";
    import { evaluate } from "./src/policy.ts";
    for (const action of ["read", "write", "delete"]) assert.equal(evaluate("admin", action), true);
    assert.equal(evaluate("editor", "read"), true);
    assert.equal(evaluate("editor", "write"), true);
    assert.equal(evaluate("editor", "delete"), false);
    assert.equal(evaluate("viewer", "read"), true);
    assert.equal(evaluate("viewer", "write"), false);
    assert.equal(evaluate("viewer", "delete"), false);
  `);
}

async function verifySynthesizeReleaseReport() {
  const report = await text("REPORT.md");
  const lines = report.trimEnd().split("\n");
  assert.equal(lines[0], "# Release readiness");
  assert(lines.includes("Decision: HOLD"));
  const bullets = lines.filter((line) => line.startsWith("- "));
  assert.equal(bullets.length, 2);
  assert(
    bullets.some(
      (line) => line.includes("integration tests") && line.endsWith("(evidence/build.txt)")
    )
  );
  assert(
    bullets.some(
      (line) => line.includes("critical vulnerability") && line.endsWith("(evidence/security.txt)")
    )
  );
  assert(!report.toLowerCase().includes("ready to release"));
}

async function verifySynthesizeIncidentSummary() {
  assert.deepEqual(await json("summary.json"), {
    incidentId: "INC-204",
    failedChecks: ["checkout-e2e", "payment-latency"],
    firstFailureAt: "2026-07-13T09:04:00Z",
    decision: "rollback"
  });
  assert.equal((await json("evidence/events.json")).length, 4);
}

const verifiers = {
  "small-edit-copy": verifySmallEditCopy,
  "small-edit-config": verifySmallEditConfig,
  "small-edit-slug": verifySmallEditSlug,
  "coupled-order-total": verifyCoupledOrderTotal,
  "coupled-user-display": verifyCoupledUserDisplay,
  "coupled-ticket-state": verifyCoupledTicketState,
  "generate-duration-parser": verifyGenerateDurationParser,
  "generate-access-policy": verifyGenerateAccessPolicy,
  "synthesize-release-report": verifySynthesizeReleaseReport,
  "synthesize-incident-summary": verifySynthesizeIncidentSummary
};

const verifier = verifiers[caseId];
if (verifier === undefined) throw new Error(`unknown benchmark case ${caseId}`);
await verifier();
process.stdout.write(`${caseId}: PASS\n`);
