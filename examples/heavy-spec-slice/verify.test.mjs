import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const readLocal = (name) => readFile(join(root, name), "utf8");

test("slice manifest pins the source and selects exactly three screens", async () => {
  const manifest = JSON.parse(await readLocal("slice-manifest.json"));
  const source = await readFile(manifest.source.path);
  const digest = createHash("sha256").update(source).digest("hex");

  assert.equal(manifest.source.totalScreens, 102);
  assert.equal(digest, manifest.source.sha256);
  assert.deepEqual(
    manifest.selectedScreens.map(({ id }) => id),
    ["home-wallet", "pay-qr", "admin-policy-list"]
  );
});

test("HTML contains the three representative screens and required evidence", async () => {
  const html = await readLocal("index.html");

  for (const screenId of ["home-wallet", "pay-qr", "admin-policy-list"]) {
    assert.match(html, new RegExp(`data-screen="${screenId}"`));
  }

  for (const evidence of [
    "사용가능 잔액",
    "확인 전에는 잔액이 차감되지 않아요",
    "승인·생애주기·실행 상태를 각각 표시합니다.",
    "발행계획 참조"
  ]) {
    assert.ok(html.includes(evidence), `missing evidence: ${evidence}`);
  }

  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
});

test("CSS carries the pinned visual tokens and mobile touch target", async () => {
  const css = await readLocal("styles.css");

  assert.ok(css.includes("--primary: #2368d9"));
  assert.ok(css.includes("--ink: #191f28"));
  assert.ok(css.includes("--verified: #00796b"));
  assert.match(css, /min-height:\s*44px/);
});

test("browser script is syntactically valid and wires key interactions", async () => {
  const app = await readLocal("app.js");

  execFileSync(process.execPath, ["--check", join(root, "app.js")]);
  assert.ok(app.includes("showScreen"));
  assert.ok(app.includes("applyPolicyFilters"));
  assert.ok(app.includes("payButton.addEventListener"));
});
