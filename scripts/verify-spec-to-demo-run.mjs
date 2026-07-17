import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { chromium } from "playwright";
import {
  findMissingStableActions,
  findUnbackedPeriodCopy
} from "./check-spec-to-demo-artifact.mjs";
import { parseDesignContractVersion } from "./design-contract-lib.mjs";
import { runDemoLayoutQa, startStaticDemoServer } from "./demo-layout-qa-lib.mjs";
import { activateActor } from "./spec-to-demo-actor-control.mjs";
import {
  actionSurface,
  executeAction,
  fillSurface,
  hasAttributeValue,
  locatorByAttribute,
  requiresActionSurface,
  stateSnapshot,
  submitActionSurface
} from "./spec-to-demo-browser-evidence-lib.mjs";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function traceVerifierPhase(phase) {
  if (process.env.AAWP_VERIFIER_TRACE === "1") {
    process.stderr.write(`AAWP_VERIFIER_PHASE ${phase}\n`);
  }
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

function forbiddenKey(value, keys) {
  if (Array.isArray(value)) return value.some((child) => forbiddenKey(child, keys));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => keys.has(key) || forbiddenKey(child, keys));
}

function records(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function acceptanceEvidenceChecks(source) {
  const acceptance = source.acceptance;
  const scenarios = Array.isArray(acceptance)
    ? records(acceptance)
    : records(acceptance?.scenarios);
  return scenarios.flatMap((scenario) =>
    records(scenario.evidenceChecks).map((check) => ({
      ...check,
      scenarioId: scenario.id
    }))
  );
}

async function visibleLocatorByAttribute(page, attribute, value) {
  const candidates = page.locator(`[${attribute}]`);
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if ((await candidate.getAttribute(attribute)) === value && (await candidate.isVisible())) {
      return candidate;
    }
  }
  return undefined;
}

async function actionLocator(page, actionId, actorId) {
  const candidates = page.locator("[data-aawp-action-id]");
  let best;
  let bestScore = -1;
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (
      (await candidate.getAttribute("data-aawp-action-id")) !== actionId ||
      !(await candidate.isVisible())
    ) {
      continue;
    }
    const tag = await candidate.evaluate((element) => element.tagName.toLowerCase());
    const candidateActor = await candidate.getAttribute("data-aawp-actor-id");
    const score =
      (typeof actorId === "string" && candidateActor === actorId ? 4 : 0) +
      (["a", "button"].includes(tag) ? 2 : tag === "select" ? 1 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

async function waitForStateChange(page, keys, before) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const after = await stateSnapshot(page, keys);
    if (keys.some((key) => after[key] !== before[key])) return after;
    await page.waitForTimeout(100);
  }
  assert.fail(`command did not change observable state keys: ${keys.join(", ")}`);
}

async function verifyExecutableAcceptance(url, source, requestedScreens) {
  const checks = acceptanceEvidenceChecks(source);
  assert.ok(checks.length > 0, "S1 acceptance has no executable browser evidence checks");
  const requested = new Set(requestedScreens);
  const outOfScope = checks
    .filter((check) => typeof check.screenId === "string" && !requested.has(check.screenId))
    .map((check) => check.screenId);
  assert.deepEqual(
    [...new Set(outOfScope)],
    [],
    `acceptance needs screens outside selection: ${[...new Set(outOfScope)].join(", ")}`
  );

  const failures = [];
  for (const check of checks) {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      const page = await context.newPage();
      page.setDefaultTimeout(5_000);
      traceVerifierPhase(`acceptance:check:start:${String(check.id ?? "unknown-check")}`);
      try {
        assert.equal(check.kind, "browser", `${String(check.id)} is not a browser check`);
        assert.equal(typeof check.screenId, "string", `${String(check.id)} has no screenId`);
        assert.ok(Array.isArray(check.assertions), `${String(check.id)} has no assertions`);
        // A fresh browser context gives every evidence check an isolated storage and session state.
        // One direct canonical navigation is sufficient and avoids accumulating reload resources.
        await page.goto(new URL(`#${check.screenId}`, url).href, { waitUntil: "networkidle" });
        if (typeof check.actorId === "string") await activateActor(page, check.actorId);
        traceVerifierPhase(`acceptance:check:actor:${String(check.id ?? "unknown-check")}`);

        if (check.assertions.includes("control-height-consistent")) continue;
        if (check.assertions.includes("table-no-overflow")) continue;
        assert.equal(typeof check.actionId, "string", `${String(check.id)} has no actionId`);
        const action = await actionLocator(page, check.actionId, check.actorId);
        traceVerifierPhase(`acceptance:check:action:${String(check.id ?? "unknown-check")}`);
        const isVisible = action !== undefined && (await action.isVisible());
        if (check.assertions.includes("hidden")) {
          assert.equal(isVisible, false, `${check.actionId} must be hidden for ${check.actorId}`);
          continue;
        }
        assert.ok(action, `${String(check.id)} action is missing: ${check.actionId}`);
        assert.equal(isVisible, true, `${check.actionId} must be visible for ${check.actorId}`);
        if (check.assertions.every((assertion) => assertion === "visible")) continue;

        const stateKeys = Array.isArray(check.stateKeys) ? check.stateKeys : [];
        const before = stateKeys.length > 0 ? await stateSnapshot(page, stateKeys) : {};
        traceVerifierPhase(`acceptance:check:state-before:${String(check.id ?? "unknown-check")}`);
        if (check.assertions.includes("navigates")) {
          await action.click();
          const sourceScreen = records(source.screens).find(
            (candidate) => candidate.id === check.screenId
          );
          const sourceAction = records(sourceScreen?.actions).find(
            (candidate) => candidate.id === check.actionId
          );
          assert.equal(
            sourceAction?.targetType ?? sourceAction?.targetKind,
            "screen",
            `${check.actionId} navigation check has no screen target`
          );
          assert.equal(
            typeof sourceAction?.targetId,
            "string",
            `${check.actionId} navigation check has no targetId`
          );
          await page.waitForURL((candidate) => candidate.hash === `#${sourceAction.targetId}`, {
            timeout: 3_000
          });
          continue;
        }
        let surface = await locatorByAttribute(page, "data-aawp-action-surface", check.actionId);
        if (requiresActionSurface(check.assertions)) {
          if (!surface || !(await surface.isVisible())) {
            surface = await actionSurface(page, action, check.actionId);
          }
        }
        traceVerifierPhase(`acceptance:check:surface:${String(check.id ?? "unknown-check")}`);
        if (check.assertions.includes("action-specific-surface")) {
          assert.ok(surface, `${check.actionId} has no action-specific surface`);
          assert.equal(await surface.isVisible(), true, `${check.actionId} surface is not visible`);
        }

        if (check.assertions.includes("input-preserved-on-error")) {
          assert.ok(surface, `${check.actionId} error preservation needs an action surface`);
          await fillSurface(surface);
          const fields = surface.locator("input:not([type=hidden]):not([type=file]), textarea");
          assert.ok(
            (await fields.count()) > 0,
            `${check.actionId} error preservation surface has no editable input`
          );
          const beforeValues = await fields.evaluateAll((items) => items.map((item) => item.value));
          const trigger = await visibleLocatorByAttribute(
            page,
            "data-aawp-error-trigger",
            check.actionId
          );
          assert.ok(trigger, `${check.actionId} has no visible deterministic error trigger`);
          assert.notEqual(
            await trigger.getAttribute("data-aawp-submit-action"),
            check.actionId,
            `${check.actionId} error trigger must be separate from the success submit control`
          );
          await trigger.click();
          await page.locator('[role="alert"]').waitFor({ state: "visible", timeout: 3_000 });
          const afterValues = await fields.evaluateAll((items) => items.map((item) => item.value));
          assert.deepEqual(afterValues, beforeValues, `${check.actionId} lost input after error`);
        }

        const stateAssertions = [
          "state-change",
          "persists-after-reload",
          "work-item-created",
          "no-duplicate"
        ].filter((assertion) => check.assertions.includes(assertion));
        if (stateAssertions.length === 0) continue;
        assert.ok(stateKeys.length > 0, `${check.actionId} state assertion has no stateKeys`);
        if (check.assertions.includes("no-duplicate")) {
          traceVerifierPhase(
            `acceptance:check:duplicate-before:${String(check.id ?? "unknown-check")}`
          );
          const preexistingDuplicate = await hasAttributeValue(
            page,
            "data-aawp-duplicate-blocked",
            check.actionId
          );
          assert.equal(
            preexistingDuplicate,
            false,
            `${check.actionId} exposes duplicate rejection evidence before a duplicate attempt`
          );
        }
        traceVerifierPhase(`acceptance:check:execute:${String(check.id ?? "unknown-check")}`);
        await executeAction(action, check.actionId, surface);
        traceVerifierPhase(`acceptance:check:executed:${String(check.id ?? "unknown-check")}`);
        const after = await waitForStateChange(page, stateKeys, before);
        if (check.assertions.includes("work-item-created")) {
          const key = stateKeys.find((candidate) => /(?:workitem|handoff)count/iu.test(candidate));
          assert.ok(
            key,
            `${check.actionId} creation check has no workItemCount or handoffCount state key`
          );
          assert.ok(
            Number(after[key]) > Number(before[key]),
            `${check.actionId} created no work item`
          );
        }
        if (check.assertions.includes("persists-after-reload")) {
          await page.reload({ waitUntil: "networkidle" });
          assert.deepEqual(
            await stateSnapshot(page, stateKeys),
            after,
            `${check.actionId} state did not persist after reload`
          );
        }
        if (check.assertions.includes("no-duplicate")) {
          const secondAction = await actionLocator(page, check.actionId, check.actorId);
          assert.ok(secondAction, `${check.actionId} disappeared before duplicate check`);
          let secondSurface = await locatorByAttribute(
            page,
            "data-aawp-action-surface",
            check.actionId
          );
          if (
            check.assertions.includes("action-specific-surface") &&
            (!secondSurface || !(await secondSurface.isVisible()))
          ) {
            secondSurface = await actionSurface(page, secondAction, check.actionId);
          }
          await executeAction(secondAction, check.actionId, secondSurface);
          const duplicate = await locatorByAttribute(
            page,
            "data-aawp-duplicate-blocked",
            check.actionId
          );
          assert.ok(duplicate, `${check.actionId} has no duplicate-blocked evidence`);
          assert.deepEqual(await stateSnapshot(page, stateKeys), after);
        }
      } catch (error) {
        failures.push({
          checkId: String(check.id ?? "unknown-check"),
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        await context.close();
        traceVerifierPhase(`acceptance:check:complete:${String(check.id ?? "unknown-check")}`);
      }
    } finally {
      await browser.close();
    }
  }
  if (failures.length > 0) {
    const error = new Error(`AAWP_BROWSER_FINDINGS ${JSON.stringify(failures)}`);
    error.name = "BrowserEvidenceError";
    throw error;
  }
}

async function verifyDefaultEntryScreen(url, entryScreenId) {
  assert.equal(typeof entryScreenId, "string", "selection contract has no explicit entry screen");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForURL((candidate) => candidate.hash === `#${entryScreenId}`, {
      timeout: 3_000
    });
  } finally {
    await browser.close();
  }
}

async function verifyDetailPilotInteractions(url) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(new URL("#admin-voucher-policy-setup", url).href, {
      waitUntil: "networkidle"
    });
    const policyName = page.getByLabel("사업명", { exact: true });
    assert.equal(await policyName.count(), 1, "policy name must have an accessible label");
    const originalPolicyName = await policyName.inputValue();
    await policyName.fill("");
    await page.getByRole("button", { name: "결재 상신", exact: true }).click();
    await page.locator('[role="alert"]').waitFor({ state: "visible" });
    await policyName.fill(originalPolicyName);
    await page.getByRole("button", { name: "결재 상신", exact: true }).click();
    const submitted = page.getByText(/결재 상신.*준비/u).last();
    await submitted.waitFor({ state: "visible", timeout: 3000 });
    assert.equal(
      await submitted.getAttribute("role"),
      "status",
      "successful policy submission feedback must use role=status"
    );

    await page.goto(new URL("#admin-payout-execution", url).href, {
      waitUntil: "networkidle"
    });
    const start = page.getByRole("button", { name: "지급 시작", exact: true });
    assert.equal(await start.isDisabled(), true, "payout must be blocked before required gates");
    await page.getByRole("button", { name: "발행 검토 요청", exact: true }).click();
    await page.getByRole("button", { name: "재인증", exact: true }).click();
    assert.equal(
      await start.isEnabled(),
      true,
      "payout must unlock after issuance and reauthentication"
    );
    await start.click();
    const confirmation = page.getByRole("dialog", { name: "지급 시작 확인", exact: true });
    await confirmation.waitFor({ state: "visible", timeout: 3000 });
    await confirmation.getByRole("button", { name: /확인(?: 후 시작)?/u }).click();
    await page
      .getByText(/실행 중/u)
      .last()
      .waitFor({ state: "visible", timeout: 3000 });
    await page
      .getByText(/지급.*(?:생성|실행).*완료/u)
      .last()
      .waitFor({ state: "visible", timeout: 5000 });
  } finally {
    await browser.close();
  }
}

const inputPath = process.env.AAWP_INPUT_PATH;
const executionDirectory = process.env.AAWP_EXECUTION_DIR;
if (!inputPath) throw new Error("AAWP_INPUT_PATH is required");
if (!executionDirectory) throw new Error("AAWP_EXECUTION_DIR is required");

const input = JSON.parse(await readFile(inputPath, "utf8"));
const brief = input.brief;
assert.equal(brief?.schemaVersion, "aawp/spec-to-demo-brief/v1");
assert.ok(Array.isArray(brief.requestedScreens) && brief.requestedScreens.length > 0);
assert.equal(new Set(brief.requestedScreens).size, brief.requestedScreens.length);
assert.equal(brief.designContract?.path, "DESIGN.md");

const designBytes = await readFile(resolve("DESIGN.md"));
assert.equal(sha256(designBytes), brief.designContract.byteSha256, "DESIGN.md digest changed");
const designVersion = parseDesignContractVersion(designBytes.toString("utf8"));
assert.equal(designVersion, brief.designContract.version, "DESIGN.md version changed");

const sourceBytes = await readFile(resolve(brief.sourceSpec.path));
assert.equal(sha256(sourceBytes), brief.sourceSpec.byteSha256, "source spec digest changed");
const source = JSON.parse(sourceBytes.toString("utf8"));
assert.ok(Array.isArray(source.screens), "source spec must contain screens[]");
assert.equal(source.selectionContract?.status, "ready", "S1 selection contract is not ready");
assert.deepEqual(source.selectionContract, brief.selectionContract);
for (const section of [
  "flows",
  "stateMachines",
  "apiContracts",
  "dataBindings",
  "authority",
  "acceptance"
]) {
  assert.ok(
    source.projection?.includedSections?.includes(section),
    `source projection lost semantic section: ${section}`
  );
}

const demoDirectory = within(resolve(executionDirectory), brief.demoArtifact?.relativePath);
const [html, app, styles, manifest] = await Promise.all([
  readFile(resolve(demoDirectory, "index.html"), "utf8"),
  readFile(resolve(demoDirectory, "app.js"), "utf8"),
  readFile(resolve(demoDirectory, "styles.css"), "utf8"),
  readFile(resolve(demoDirectory, "manifest.json"), "utf8").then(JSON.parse)
]);

assert.match(html, /styles\.css/);
assert.match(html, /app\.js/);
assert.equal(manifest.schemaVersion, "aawp/demo-manifest/v1");
const expectedArtifactWorkflowVersion =
  process.env.AAWP_REVERIFY_SOURCE_WORKFLOW_VERSION ?? "0.7.3";
assert.deepEqual(manifest.workflow, {
  id: "spec-to-demo",
  version: expectedArtifactWorkflowVersion
});
assert.deepEqual(manifest.designInputs, ["DESIGN.md"]);
assert.deepEqual(manifest.designContract, brief.designContract);
assert.equal(manifest.sourceSpec?.path, brief.sourceSpec.path);
assert.equal(manifest.sourceSpec?.byteSha256, brief.sourceSpec.byteSha256);
assert.equal(
  forbiddenKey(
    manifest,
    new Set([
      "visualReference",
      "visualReferenceDigest",
      "presentationContract",
      "presentationDigest",
      "adapterVersion"
    ])
  ),
  false,
  "manifest contains a forbidden legacy design input"
);

const expectedScreenIds = [...brief.requestedScreens].sort();
const combined = `${html}\n${app}\n${styles}\n${JSON.stringify(manifest)}`;
assert.ok(Array.isArray(manifest.screens), "manifest.screens must be an array");
assert.deepEqual(
  manifest.screens.map((screen) => screen?.id).sort(),
  expectedScreenIds,
  "demo must contain exactly the requested screens"
);
for (const screenId of expectedScreenIds) {
  const screen = source.screens.find((candidate) => candidate?.id === screenId);
  assert.ok(screen, `source screen is missing: ${screenId}`);
  assert.ok(app.includes(screenId), `app does not register screen: ${screenId}`);
  for (const copy of Array.isArray(screen.copy) ? screen.copy : []) {
    assert.ok(app.includes(copy.text), `${screenId} is missing source copy: ${copy.key}`);
  }
}
const missingStableActions = findMissingStableActions({
  source,
  requestedScreens: expectedScreenIds,
  artifactText: combined
});
assert.deepEqual(
  missingStableActions,
  [],
  `demo does not instrument stable actions: ${missingStableActions
    .map(({ screenId, actionId }) => `${screenId}.${actionId}`)
    .join(", ")}`
);
const unbackedPeriodCopy = findUnbackedPeriodCopy({
  source,
  requestedScreens: expectedScreenIds,
  requestText: brief.requestText,
  app
});
assert.deepEqual(
  unbackedPeriodCopy,
  [],
  `product UI invents period-specific records outside selected screen copy: ${unbackedPeriodCopy.join(", ")}`
);

for (const forbidden of [
  "presentation-contract.yaml",
  "visual-reference-contract.yaml",
  "design-tokens.css",
  "SPEC COMPONENT",
  "feedback count",
  "dataNeeds"
]) {
  assert.ok(!combined.includes(forbidden), `forbidden design/authoring input leaked: ${forbidden}`);
}

assert.match(styles, /#0a2540/i, "authority token is missing");
assert.match(styles, /#2368d9/i, "primary action token is missing");
assert.match(styles, /grid-template-columns\s*:\s*240px\s+(?:1fr|minmax\(0,\s*1fr\))/i);
assert.match(styles, /min-height\s*:\s*(?:44|4[5-9]|[5-9]\d)px/i);
assert.match(styles, /@media\s*\(max-width:\s*(?:1279|1280)px\)/i);
assert.match(styles, /@media\s*\(max-width:\s*600px\)/i);
assert.match(app, /addEventListener|\.onclick\s*=|button\([^)]*,[^)]*,\s*\(\)\s*=>/);
assert.doesNotMatch(
  app,
  /<(?:span|i)[^>]*class=["'][^"']*nav-icon[^"']*["'][^>]*>\s*[^<\s][^<]*<\/(?:span|i)>/u,
  "navigation uses a text glyph instead of a real icon asset"
);

const isDetailPilot = expectedScreenIds.every((screenId) =>
  ["admin-voucher-policy-setup", "admin-payout-execution"].includes(screenId)
);
const staticDemo = await startStaticDemoServer(demoDirectory);
let layoutQa;
try {
  traceVerifierPhase("layout:start");
  layoutQa = await runDemoLayoutQa({
    url: staticDemo.url,
    screens: expectedScreenIds,
    takeScreenshots: false,
    ...(isDetailPilot
      ? {
          maxPageHeight: { desktop: 1200, mobile: 2400 },
          forbiddenVisibleText: [
            "context",
            " form",
            "evidence",
            "authoritative",
            "read-only",
            "payoutformula="
          ],
          requiredPanelCount: 3,
          expectedControlHeight: 48,
          requiredRailBackground: "rgb(10, 37, 64)",
          requiredVisibleText: ["Gyeonggi Integrated Wallet"],
          requiredVisibleRoutes: expectedScreenIds,
          requiredPanelLayoutByScreen: {
            "admin-voucher-policy-setup": ["context", "form", "evidence"],
            "admin-payout-execution": ["summary", "gate", "evidence"]
          }
        }
      : {})
  });
  traceVerifierPhase("layout:complete");
  if (isDetailPilot) await verifyDetailPilotInteractions(staticDemo.url);
  traceVerifierPhase("entry:start");
  await verifyDefaultEntryScreen(staticDemo.url, brief.selectionContract.entryScreenId);
  traceVerifierPhase("entry:complete");
  traceVerifierPhase("acceptance:start");
  await verifyExecutableAcceptance(staticDemo.url, source, expectedScreenIds);
  traceVerifierPhase("acceptance:complete");
} finally {
  await staticDemo.close();
}
assert.equal(layoutQa.ok, true, layoutQa.failures.join("\n"));

const verdict = {
  schemaVersion: "aawp/verdict/v1",
  status: "passed",
  runId: process.env.AAWP_RUN_ID,
  workflowId: process.env.AAWP_WORKFLOW_ID,
  verifierNodeId: process.env.AAWP_NODE_ID,
  artifactWorkflow: manifest.workflow,
  verifierWorkflowVersion: "0.7.3",
  demoDirectory,
  designContract: brief.designContract,
  designInputs: ["DESIGN.md"],
  requestedScreens: expectedScreenIds,
  maturity: {
    S0: "passed",
    S1: "passed",
    S2: "not-evaluated",
    S3: "out-of-scope",
    closedFindingCode: "DEMO_EVIDENCE_PENDING",
    evidenceCheckIds: acceptanceEvidenceChecks(source).map((check) => check.id)
  },
  checks: {
    inputDigests: true,
    mdOnlyDesign: true,
    exactScreenSet: true,
    explicitEntryScreen: true,
    sourceCopy: true,
    responsiveShell: true,
    browserLayout: true,
    interactionStates: true,
    executableAcceptance: true
  }
};
process.stdout.write(`${JSON.stringify(verdict)}\n`);
