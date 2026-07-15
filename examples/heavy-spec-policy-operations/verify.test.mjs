import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
  const [selectionSource, bundleSource, sourceHtml, script, screenHtml, screenRuntime, styles] =
    await Promise.all([
      readFile(new URL("selection-manifest.json", root), "utf8"),
      readFile(new URL("bundle-manifest.json", root), "utf8"),
      readFile(new URL("index.html", root), "utf8"),
      readFile(new URL("app.js", root), "utf8"),
      readFile(new URL("screen.html", root), "utf8"),
      readFile(new URL("screen-runtime.js", root), "utf8"),
      readFile(new URL("styles.css", root), "utf8")
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
  for (const screen of bundle.screens) {
    const artifact = JSON.parse(await readFile(new URL(screen.artifactPath, root), "utf8"));
    assert.deepEqual(artifact.screen, sourceById.get(screen.id));
    assert.equal(artifact.source.contentDigest, expectedSourceDigest);
    assert.equal(
      screen.surfaceId,
      artifact.screen.surface === "관리 콘솔(웹)" ? "admin-web" : "issuer-web"
    );
  }
  assert.match(sourceHtml, new RegExp(expectedSourceDigest));
  assert.match(script, /location\.hash/);
  assert.match(script, /bundle-manifest\.json/);
  assert.match(screenRuntime, /screen-artifacts/);
  assert.match(styles, /--blue:\s*#2368d9/i);
  assert.doesNotMatch(
    `${sourceHtml}\n${script}\n${screenHtml}\n${screenRuntime}\n${styles}`,
    /https?:\/\//i
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
