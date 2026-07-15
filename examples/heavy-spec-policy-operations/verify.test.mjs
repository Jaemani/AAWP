import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = new URL("./", import.meta.url);
const expectedSourceDigest = "b4b50cd9c1d2321c8936126c00c3ff242bb88ba5445c26abfffc03187993df33";

test("selection manifest pins exactly 22 requested screens", async () => {
  const manifest = JSON.parse(await readFile(new URL("selection-manifest.json", root), "utf8"));
  const source = await readFile(manifest.source);
  const sourceDocument = JSON.parse(source);
  const sourceDigest = createHash("sha256").update(source).digest("hex");
  assert.equal(manifest.sourceSha256, expectedSourceDigest);
  assert.equal(sourceDigest, expectedSourceDigest);
  assert.equal(sourceDocument.screens.length, 102);
  assert.equal(manifest.requestText, "정책, 유통, 발행, 준비 관련 페이지 만들어줘");
  assert.equal(manifest.logicalConsistencyReview, "excluded; owned by spec-feedback-to-spec");
  const screenIds = manifest.groups.flatMap((group) => group.screenIds);
  assert.equal(screenIds.length, 22);
  assert.equal(new Set(screenIds).size, 22);
  assert.deepEqual(
    manifest.groups.map((group) => group.screenIds.length),
    [6, 7, 9]
  );
  const sourceScreenIds = new Set(sourceDocument.screens.map((screen) => screen.id));
  assert.ok(screenIds.every((screenId) => sourceScreenIds.has(screenId)));
});

test("bundle keeps selected screens independent and preserves their source definitions", async () => {
  const [
    selectionSource,
    bundleSource,
    sourceHtml,
    script,
    screenHtml,
    screenRuntime,
    styles,
    screenStyles,
    sourceContractsSource,
    presentationSource,
    visualReferenceSource,
    tokenStyles
  ] = await Promise.all([
    readFile(new URL("selection-manifest.json", root), "utf8"),
    readFile(new URL("bundle-manifest.json", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("screen.html", root), "utf8"),
    readFile(new URL("screen-runtime.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
    readFile(new URL("screen.css", root), "utf8"),
    readFile(new URL("source-contracts.json", root), "utf8"),
    readFile(new URL("presentation-contract.yaml", root), "utf8"),
    readFile(new URL("visual-reference-contract.yaml", root), "utf8"),
    readFile(new URL("design-tokens.css", root), "utf8")
  ]);
  const selection = JSON.parse(selectionSource);
  const bundle = JSON.parse(bundleSource);
  const source = JSON.parse(await readFile(selection.source, "utf8"));
  const sourceById = new Map(source.screens.map((screen) => [screen.id, screen]));
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("app.js", root))]);
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("screen-runtime.js", root))]);
  assert.equal(bundle.schemaVersion, "aawp/demo-bundle/v1");
  assert.deepEqual(
    bundle.bundles.map((item) => item.screenIds.length),
    [6, 7, 9]
  );
  assert.deepEqual(
    bundle.surfaces.map((surface) => [surface.label, surface.screenIds.length]),
    [
      ["관리 콘솔(웹)", 13],
      ["발행사 콘솔(웹)", 9]
    ]
  );
  assert.equal(bundle.screens.length, 22);
  assert.equal(new Set(bundle.screens.map((screen) => screen.artifactPath)).size, 22);
  const sourceContracts = JSON.parse(sourceContractsSource);
  const presentation = parseYaml(presentationSource);
  const presentationDigest = createHash("sha256").update(presentationSource).digest("hex");
  const visualReference = parseYaml(visualReferenceSource);
  const visualReferenceDigest = createHash("sha256").update(visualReferenceSource).digest("hex");
  const componentDefinitionByName = new Map(
    sourceContracts.components.map((component) => [component.name, component])
  );
  assert.equal(sourceContracts.schemaVersion, "aawp/demo-source-contracts/v1");
  assert.deepEqual(sourceContracts.presentationContract, {
    path: "presentation-contract.yaml",
    contentDigest: presentationDigest,
    schemaVersion: "aawp/presentation-contract/v1",
    name: "Gyeonggi Integrated Wallet"
  });
  assert.deepEqual(sourceContracts.visualReferenceContract, {
    path: "visual-reference-contract.yaml",
    contentDigest: visualReferenceDigest,
    schemaVersion: "aawp/visual-reference-contract/v1",
    name: "Policy console visual baseline",
    sourceRunId: "run_bf24da5f-35d3-4df9-ba8a-d6cbcb182838"
  });
  assert.equal(
    visualReference.source.files["styles.css"],
    "f75d8b3452274e56604396ce792882e348f0853b86127f2e5e8d2c943d4541fe"
  );
  assert.equal(presentation.colors["primary-container"], "#2368d9");
  assert.equal(presentation.spacing["nav-rail-width"], "240px");
  assert.equal(presentation.typography.title.fontSize, "22px");
  assert.match(tokenStyles, /--color-primary-container:\s*#2368d9/i);
  assert.match(tokenStyles, /--spacing-nav-rail-width:\s*240px/i);
  assert.match(tokenStyles, /--type-title-size:\s*22px/i);
  assert.ok(
    sourceContracts.designSystem.palette.some(
      (token) => token.name === "primary" && token.value === "#2368D9"
    )
  );
  assert.ok(
    sourceContracts.designSystem.typography.some(
      (token) => token.name === "title" && token.size === "22px"
    )
  );
  assert.match(sourceContracts.designSystem.spacing, /nav-rail 240px/);
  const navigationIconNames = new Set();
  for (const screen of bundle.screens) {
    const artifact = JSON.parse(await readFile(new URL(screen.artifactPath, root), "utf8"));
    for (const item of artifact.navigation.items) navigationIconNames.add(item.icon);
    assert.deepEqual(artifact.screen, sourceById.get(screen.id));
    assert.equal(artifact.source.contentDigest, expectedSourceDigest);
    assert.equal(
      screen.surfaceId,
      artifact.screen.surface === "관리 콘솔(웹)" ? "admin-web" : "issuer-web"
    );
    assert.equal(artifact.navigation.type, "nav-rail");
    assert.deepEqual(artifact.renderer, {
      adapterId: "aawp-console-surface",
      adapterVersion: "0.3.0",
      presentationDigest,
      visualReferenceDigest,
      formFactor: "web"
    });
    assert.ok(artifact.navigation.items.length >= 7);
    assert.equal(artifact.sourceContracts.path, "source-contracts.json");
    assert.match(artifact.sourceContracts.contentDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(artifact.sourceContracts.componentNames, artifact.screen.components);
    assert.ok(
      artifact.sourceContracts.componentNames.every((componentName) => {
        const component = componentDefinitionByName.get(componentName);
        return (
          typeof component?.purpose === "string" &&
          Array.isArray(component.props) &&
          Array.isArray(component.variants) &&
          Array.isArray(component.states)
        );
      })
    );
    assert.ok(
      artifact.sourceContracts.componentNames.every((componentName) =>
        componentDefinitionByName.has(componentName)
      )
    );
    assert.ok(Array.isArray(artifact.interactions.affordances));
    assert.ok(Array.isArray(artifact.interactions.reachableStates));
    assert.ok(Array.isArray(artifact.specFeedback));
    for (const affordance of artifact.interactions.affordances) {
      assert.ok(
        ["selected-screen", "out-of-scope-screen", "unresolved-navigation", "demo-state"].includes(
          affordance.resolution.kind
        )
      );
    }
  }
  assert.match(sourceHtml, new RegExp(expectedSourceDigest));
  assert.match(script, /location\.hash/);
  assert.match(script, /bundle-manifest\.json/);
  assert.match(screenRuntime, /screen-artifacts/);
  assert.match(screenRuntime, /aawp:demo-navigate/);
  assert.match(screenRuntime, /console-rail/);
  assert.match(screenRuntime, /admin-policy-list/);
  assert.match(screenRuntime, /admin-supply-burn-settlement/);
  for (const screen of bundle.screens) assert.match(screenRuntime, new RegExp(screen.id));
  assert.match(screenRuntime, /unresolved-navigation/);
  assert.doesNotMatch(screenRuntime, /artifact\.screen\.(?:route|purpose)/);
  assert.doesNotMatch(screenStyles, /\.page-purpose|\.route\s*\{/);
  assert.match(screenRuntime, /copy\("title", artifact\.screen\.title\)/);
  assert.match(script, /aawp:demo-navigate/);
  assert.match(script, /event\.origin !== location\.origin/);
  assert.match(script, /new URL\(entry, location\.href\)/);
  assert.doesNotMatch(sourceHtml, /class="navigator"/);
  assert.doesNotMatch(styles, /\.navigator/);
  assert.match(screenStyles, /grid-template-columns:\s*var\(--spacing-nav-rail-width\)/);
  assert.match(screenStyles, /background:\s*var\(--color-authority-fg\)/);
  assert.match(screenStyles, /width:\s*min\(1440px, calc\(100vw - 56px\)\)/);
  assert.match(screenStyles, /var\(--type-title-size\)/);
  assert.match(screenStyles, /var\(--type-table-cell-size\)/);
  assert.doesNotMatch(screenRuntime, /createElementNS/);
  for (const iconName of ["check", "clock", "triangle-alert", "shield-check", "info"]) {
    const iconSource = await readFile(new URL(`icons/${iconName}.svg`, root), "utf8");
    assert.match(iconSource, /class="lucide /);
  }
  for (const iconName of navigationIconNames) {
    const iconSource = await readFile(new URL(`icons/${iconName}.svg`, root), "utf8");
    assert.match(iconSource, /<svg/);
  }
  for (const component of sourceContracts.components) {
    assert.match(screenRuntime, new RegExp(`${component.name}:`));
  }
  const networkFreeSources =
    `${sourceHtml}\n${script}\n${screenHtml}\n${screenRuntime}\n${styles}\n${screenStyles}\n${tokenStyles}`.replaceAll(
      "http://www.w3.org/2000/svg",
      ""
    );
  assert.doesNotMatch(networkFreeSources, /https?:\/\//i);
});

test("source navigation and selected screen flows resolve without invented links", async () => {
  const bundle = JSON.parse(await readFile(new URL("bundle-manifest.json", root), "utf8"));
  const selectedIds = new Set(bundle.screens.map((screen) => screen.id));
  const artifacts = new Map();
  for (const screen of bundle.screens) {
    artifacts.set(
      screen.id,
      JSON.parse(await readFile(new URL(screen.artifactPath, root), "utf8"))
    );
  }

  const policyList = artifacts.get("admin-policy-list");
  for (const target of [
    "admin-circulation-policy-composer",
    "admin-circulation-topup-policy",
    "admin-voucher-policy-setup"
  ]) {
    const action = policyList.interactions.affordances.find(
      (affordance) => affordance.target === target
    );
    assert.equal(action.resolution.kind, "selected-screen");
    assert.equal(action.resolution.screenId, target);
  }

  const issuerPlans = artifacts.get("admin-issuance-plans");
  assert.ok(
    issuerPlans.interactions.affordances.some(
      (affordance) =>
        affordance.target === "admin-issuance-plan" &&
        affordance.resolution.kind === "selected-screen"
    )
  );
  const issuerExecute = artifacts.get("admin-issuance-execute");
  assert.ok(
    issuerExecute.interactions.affordances.some(
      (affordance) =>
        affordance.target === "admin-issuance-ledger" &&
        affordance.resolution.kind === "selected-screen"
    )
  );

  const outOfScope = [...artifacts.values()]
    .flatMap((artifact) => artifact.interactions.affordances)
    .filter((affordance) => affordance.resolution.kind === "out-of-scope-screen");
  assert.ok(outOfScope.length > 0);
  assert.ok(outOfScope.every((affordance) => !selectedIds.has(affordance.target)));
  assert.ok(
    [...artifacts.values()]
      .flatMap((artifact) => artifact.navigation.items)
      .some((item) => item.resolution.kind === "out-of-scope-screen")
  );
});

test("source digest in the fixture remains stable", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../heavy-spec-policy-operations.input.json", root), "utf8")
  );
  assert.equal(fixture.brief.sourceSha256, expectedSourceDigest);
  assert.equal(fixture.brief.scopeSelection.screenCount, 22);
  const digest = createHash("sha256")
    .update(JSON.stringify(fixture.brief.scopeSelection))
    .digest("hex");
  assert.match(digest, /^[a-f0-9]{64}$/);
});
