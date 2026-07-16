import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { chromium } from "playwright";
import { parseDesignContractVersion } from "./design-contract-lib.mjs";
import { runDemoLayoutQa, startStaticDemoServer } from "./demo-layout-qa-lib.mjs";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
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
assert.deepEqual(manifest.workflow, { id: "spec-to-demo", version: "0.4.0" });
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

const combined = `${html}\n${app}\n${styles}\n${JSON.stringify(manifest)}`;
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
assert.match(app, /validation|validate|오류|필수/iu);
assert.match(app, /confirm|확인/iu);
assert.match(app, /running|진행 중|실행 중/iu);
assert.match(app, /success|완료/iu);
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
  if (isDetailPilot) await verifyDetailPilotInteractions(staticDemo.url);
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
  demoDirectory,
  designContract: brief.designContract,
  designInputs: ["DESIGN.md"],
  requestedScreens: expectedScreenIds,
  checks: {
    inputDigests: true,
    mdOnlyDesign: true,
    exactScreenSet: true,
    sourceCopy: true,
    responsiveShell: true,
    browserLayout: true,
    interactionStates: true
  }
};
process.stdout.write(`${JSON.stringify(verdict)}\n`);
