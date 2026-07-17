#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import { parseDesignContractName } from "./design-contract-lib.mjs";

function requiredMatch(value, pattern, message) {
  assert.ok(pattern.test(value), message);
}

function within(root, relativePath) {
  assert.equal(typeof relativePath, "string", "demoArtifact.relativePath is required");
  const target = resolve(root, relativePath);
  assert.ok(
    target === root || target.startsWith(`${root}${sep}`),
    "demo artifact must stay inside the run directory"
  );
  return target;
}

export function findMissingSourceCopy({ source, requestedScreens, app }) {
  assert.ok(Array.isArray(source?.screens), "source spec must contain screens[]");
  assert.ok(Array.isArray(requestedScreens) && requestedScreens.length > 0);
  assert.equal(typeof app, "string");

  const sourceScreens = new Map(source.screens.map((screen) => [screen?.id, screen]));
  const missing = [];

  for (const screenId of requestedScreens) {
    const screen = sourceScreens.get(screenId);
    assert.ok(screen, `source screen is missing: ${screenId}`);
    for (const copy of Array.isArray(screen.copy) ? screen.copy : []) {
      assert.equal(
        typeof copy?.text,
        "string",
        `${screenId} has invalid source copy: ${copy?.key}`
      );
      if (!app.includes(copy.text)) missing.push({ screenId, key: copy.key, text: copy.text });
    }
  }

  return missing;
}

export function findUnregisteredScreens({ app, requestedScreens }) {
  assert.equal(typeof app, "string");
  assert.ok(Array.isArray(requestedScreens) && requestedScreens.length > 0);
  return requestedScreens.filter((screenId) => !app.includes(screenId));
}

export function findMissingCanonicalHashRoutes({ app, requestedScreens }) {
  assert.equal(typeof app, "string");
  assert.ok(Array.isArray(requestedScreens) && requestedScreens.length > 0);
  return requestedScreens.filter((screenId) => !app.includes(`#${screenId}`));
}

export function findMissingStableActions({ source, requestedScreens, artifactText }) {
  assert.ok(Array.isArray(source?.screens), "source spec must contain screens[]");
  assert.ok(Array.isArray(requestedScreens) && requestedScreens.length > 0);
  assert.equal(typeof artifactText, "string");

  const sourceScreens = new Map(source.screens.map((screen) => [screen?.id, screen]));
  const hasActionInstrumentation = artifactText.includes("data-aawp-action-id");
  const missing = [];

  for (const screenId of requestedScreens) {
    const screen = sourceScreens.get(screenId);
    assert.ok(screen, `source screen is missing: ${screenId}`);
    for (const action of Array.isArray(screen.actions) ? screen.actions : []) {
      const actionId = String(action?.id ?? "");
      if (!hasActionInstrumentation || actionId.length === 0 || !artifactText.includes(actionId)) {
        missing.push({ screenId, actionId });
      }
    }
  }

  return missing;
}

export function findForbiddenVisibleAuthoringLabels(app) {
  assert.equal(typeof app, "string");
  const forbidden = [
    "context",
    "form",
    "evidence",
    "authoritative",
    "read-only",
    "payoutformula=",
    "needsnewissuance",
    "sameroundalreadystarted",
    "권위 행위"
  ];
  const structuralLiterals = new Set(["context", "form", "evidence", "authoritative", "read-only"]);
  const textNodes = [...app.matchAll(/>([^<>]+)</gu)]
    .map((match) => match[1])
    // A JavaScript template interpolation is implementation source, not rendered copy.
    // Its user-facing string arguments are checked independently below.
    .filter((text) => !text.includes("${") && !text.includes("`"))
    .map((text) => text.toLowerCase());
  const stringLiterals = [...app.matchAll(/(["'`])([^"'`\n]*)\1/gu)]
    .map((match) => match[2].toLowerCase())
    .filter((text) => !structuralLiterals.has(text.trim()));
  const visibleText = [...textNodes, ...stringLiterals];
  return forbidden.filter((label) =>
    visibleText.some((text) =>
      label.endsWith("=")
        ? text.includes(label)
        : new RegExp(`(^|[^a-z-])${label}([^a-z-]|$)`, "u").test(text)
    )
  );
}

export function findUnbackedPeriodCopy({ source, requestedScreens, requestText, app }) {
  assert.ok(Array.isArray(source?.screens), "source spec must contain screens[]");
  assert.ok(Array.isArray(requestedScreens) && requestedScreens.length > 0);
  assert.equal(typeof app, "string");
  const requested = new Set(requestedScreens);
  const allowed = [
    typeof requestText === "string" ? requestText : "",
    ...source.screens
      .filter((screen) => requested.has(screen?.id))
      .flatMap((screen) => (Array.isArray(screen?.copy) ? screen.copy : []))
      .map((copy) => copy?.text)
      .filter((text) => typeof text === "string")
  ].join("\n");
  const literals = [...app.matchAll(/>([^<>]+)</gu), ...app.matchAll(/(["'`])([^"'`\n]*)\1/gu)].map(
    (match) => match[2] ?? match[1] ?? ""
  );
  const phrases = literals.flatMap((literal) =>
    [...literal.matchAll(/20\d{2}년\s*(?:[1-4]분기|상반기|하반기)/gu)].map((match) => match[0])
  );
  return [...new Set(phrases.filter((phrase) => !allowed.includes(phrase)))].sort();
}

export function validateSpecToDemoArtifactText({ html, app, styles, manifest, productName }) {
  requiredMatch(html, /styles\.css/, "index.html must load styles.css");
  requiredMatch(html, /app\.js/, "index.html must load app.js");
  new Script(app, { filename: "app.js" });
  assert.equal(manifest?.schemaVersion, "aawp/demo-manifest/v1");
  assert.equal(typeof productName, "string");
  assert.ok(app.includes(productName), "DESIGN.md canonical product identity is missing");

  requiredMatch(styles, /#0a2540/i, "DESIGN.md authority rail token is missing");
  requiredMatch(styles, /#2368d9/i, "DESIGN.md primary action token is missing");
  requiredMatch(
    styles,
    /grid-template-columns\s*:\s*240px\s+(?:1fr|minmax\(0,\s*1fr\))/i,
    "DESIGN.md 240px desktop rail is missing"
  );
  requiredMatch(
    styles,
    /@media\s*\(max-width:\s*(?:1279|1280)px\)/i,
    "DESIGN.md 1280px rail-collapse breakpoint is missing"
  );
  requiredMatch(
    styles,
    /@media\s*\(max-width:\s*600px\)/i,
    "DESIGN.md 600px mobile breakpoint is missing"
  );
}

export async function checkSpecToDemoArtifact({ inputPath, executionDirectory }) {
  assert.ok(inputPath, "AAWP_INPUT_PATH is required");
  assert.ok(executionDirectory, "AAWP_EXECUTION_DIR is required");

  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const brief = input.brief;
  assert.equal(brief?.schemaVersion, "aawp/spec-to-demo-brief/v1");

  const [source, designSource] = await Promise.all([
    readFile(resolve(brief.sourceSpec?.path), "utf8").then(JSON.parse),
    readFile(resolve(brief.designContract?.path), "utf8")
  ]);
  const demoDirectory = within(resolve(executionDirectory), brief.demoArtifact?.relativePath);
  const [html, app, styles, manifest] = await Promise.all([
    readFile(resolve(demoDirectory, "index.html"), "utf8"),
    readFile(resolve(demoDirectory, "app.js"), "utf8"),
    readFile(resolve(demoDirectory, "styles.css"), "utf8"),
    readFile(resolve(demoDirectory, "manifest.json"), "utf8").then(JSON.parse)
  ]);

  validateSpecToDemoArtifactText({
    html,
    app,
    styles,
    manifest,
    productName: parseDesignContractName(designSource)
  });
  const missing = findMissingSourceCopy({
    source,
    requestedScreens: brief.requestedScreens,
    app
  });
  const unregistered = findUnregisteredScreens({
    app,
    requestedScreens: brief.requestedScreens
  });
  const missingHashRoutes = findMissingCanonicalHashRoutes({
    app,
    requestedScreens: brief.requestedScreens
  });
  const missingStableActions = findMissingStableActions({
    source,
    requestedScreens: brief.requestedScreens,
    artifactText: `${html}\n${app}\n${styles}\n${JSON.stringify(manifest)}`
  });
  const forbiddenVisibleLabels = findForbiddenVisibleAuthoringLabels(app);
  const unbackedPeriodCopy = findUnbackedPeriodCopy({
    source,
    requestedScreens: brief.requestedScreens,
    requestText: brief.requestText,
    app
  });

  assert.equal(
    unregistered.length,
    0,
    `app does not register requested screens: ${unregistered.join(", ")}`
  );
  assert.equal(
    missingHashRoutes.length,
    0,
    `app does not expose canonical hash routes: ${missingHashRoutes.join(", ")}`
  );
  assert.equal(
    missingStableActions.length,
    0,
    `demo does not instrument stable actions: ${missingStableActions
      .map(({ screenId, actionId }) => `${screenId}.${actionId}`)
      .join(", ")}`
  );
  assert.equal(
    forbiddenVisibleLabels.length,
    0,
    `product UI exposes authoring labels: ${forbiddenVisibleLabels.join(", ")}`
  );
  assert.equal(
    unbackedPeriodCopy.length,
    0,
    `product UI invents period-specific records outside selected screen copy: ${unbackedPeriodCopy.join(", ")}`
  );

  assert.equal(
    missing.length,
    0,
    `demo is missing source copy:\n${missing
      .map(({ screenId, key, text }) => `- ${screenId}.${key}: ${JSON.stringify(text)}`)
      .join("\n")}`
  );

  return {
    ok: true,
    screens: brief.requestedScreens.length,
    checkedCopy: brief.requestedScreens.reduce((total, screenId) => {
      const screen = source.screens.find((candidate) => candidate?.id === screenId);
      return total + (Array.isArray(screen?.copy) ? screen.copy.length : 0);
    }, 0),
    staticDesignContract: true
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await checkSpecToDemoArtifact({
    inputPath: process.env.AAWP_INPUT_PATH,
    executionDirectory: process.env.AAWP_EXECUTION_DIR
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
