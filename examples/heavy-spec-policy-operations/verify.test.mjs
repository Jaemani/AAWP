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

test("demo implements every selected screen without external runtime dependencies", async () => {
  const [manifestSource, html, script, styles] = await Promise.all([
    readFile(new URL("selection-manifest.json", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8")
  ]);
  const manifest = JSON.parse(manifestSource);
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("app.js", root))]);
  for (const screenId of manifest.groups.flatMap((group) => group.screenIds)) {
    assert.match(script, new RegExp(`id: ["']${screenId}["']`));
  }
  assert.match(html, new RegExp(expectedSourceDigest));
  assert.match(script, /location\.hash/);
  assert.match(styles, /--primary:\s*#2368d9/i);
  assert.doesNotMatch(`${html}\n${script}\n${styles}`, /https?:\/\//i);
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
