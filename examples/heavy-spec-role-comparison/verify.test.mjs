import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { digestWorkflow } from "@awf/ir";

const manifest = JSON.parse(await readFile(new URL("./comparison-manifest.json", import.meta.url)));
const baseline = JSON.parse(
  await readFile(new URL("../../refined-production-spec.json", import.meta.url))
);
const candidate = JSON.parse(
  await readFile(
    new URL(
      "../heavy-spec-feedback-revision/generated/refined-production-spec.role-workspaces.candidate.json",
      import.meta.url
    )
  )
);

test("uses the original and one complete self-describing child spec", () => {
  const candidateVersion = manifest.versions.find((version) => version.id === "candidate");
  assert.equal(candidateVersion.contentDigest, digestWorkflow(candidate));
  assert.equal(candidateVersion.parentDigest, digestWorkflow(baseline));
  assert.equal(candidateVersion.executionInput, "this_document");
  assert.deepEqual(candidate.meta.revision, {
    ...candidate.meta.revision,
    schemaVersion: "aawp/embedded-spec-revision/v1",
    status: "candidate",
    generatedBy: "spec-feedback-to-spec",
    executionInput: "this_document",
    auditSidecarsRequiredAtRuntime: false
  });
});

test("selects one or two screens per role and records the baseline payout gap", () => {
  assert.equal(manifest.roles.length, 8);
  for (const role of manifest.roles) {
    assert.ok(role.versions.candidate.screenIds.length >= 1);
    assert.ok(role.versions.candidate.screenIds.length <= 2);
    if (role.id === "payout") {
      assert.deepEqual(role.versions.baseline.screenIds, []);
      assert.match(role.versions.baseline.gap, /전용 업무 화면/);
    } else {
      assert.ok(role.versions.baseline.screenIds.length >= 1);
      assert.ok(role.versions.baseline.screenIds.length <= 2);
    }
  }
});

test("projects selected screens exactly and omits authoring prose from product artifacts", () => {
  for (const versionId of ["baseline", "candidate"]) {
    const document = versionId === "baseline" ? baseline : candidate;
    for (const projected of manifest.screens[versionId]) {
      const source = document.screens.find((screen) => screen.id === projected.id);
      assert.ok(source, projected.id);
      for (const key of [
        "id",
        "route",
        "surface",
        "title",
        "audience",
        "layout",
        "components",
        "states",
        "copy",
        "dataNeeds"
      ]) {
        assert.deepEqual(projected[key], source[key]);
      }
      assert.equal("purpose" in projected, false);
    }
  }
});

test("uses one viewer frame and a version switch instead of a side-by-side product shell", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.equal((html.match(/<iframe/g) ?? []).length, 1);
  assert.match(html, /version-switch/);
  assert.match(html, /독립 화면 열기/);
});
