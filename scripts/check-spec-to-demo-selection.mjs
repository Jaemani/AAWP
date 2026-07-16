#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function validateDemoSelectionContract(contract, requestedScreens) {
  assert.equal(contract?.schemaVersion, "aawp/demo-selection-contract/v2");
  assert.ok(
    contract.status === "ready" ||
      contract.status === "scope-expansion-required" ||
      contract.status === "selection-conflict",
    "selection contract has an invalid status"
  );
  assert.deepEqual(contract.requestedScreens, requestedScreens);
  assert.ok(
    typeof contract.entryScreenId === "string" || contract.status === "selection-conflict",
    "selection contract must declare entryScreenId"
  );
  for (const key of [
    "deprecatedScreenIds",
    "conflicts",
    "requiredScreenIds",
    "missingRequiredScreens",
    "unknownScreenTargets",
    "flowIds",
    "commandIds",
    "queryIds",
    "evidenceCheckIds"
  ]) {
    assert.ok(Array.isArray(contract[key]), `selection contract ${key} must be an array`);
  }
  if (contract.outOfScopeNavigationTargets !== undefined) {
    assert.ok(
      Array.isArray(contract.outOfScopeNavigationTargets),
      "selection contract outOfScopeNavigationTargets must be an array"
    );
  }
  const expectedStatus =
    contract.conflicts.length > 0
      ? "selection-conflict"
      : contract.missingRequiredScreens.length === 0 &&
          contract.unknownScreenTargets.length === 0
        ? "ready"
        : "scope-expansion-required";
  assert.equal(contract.status, expectedStatus, "selection contract status is inconsistent");
  return contract;
}

export function selectionFailureMessage(contract) {
  if (contract.status === "selection-conflict") {
    return `selection conflict; ${contract.conflicts
      .map((conflict) => `${conflict.code}: ${conflict.message}`)
      .join("; ")}`;
  }
  const missing = contract.missingRequiredScreens.join(", ") || "none";
  const unknown = contract.unknownScreenTargets.join(", ") || "none";
  return `scope expansion required; add screens: ${missing}; unresolved screen targets: ${unknown}`;
}

export async function checkSpecToDemoSelection({ inputPath, executionDirectory, runId }) {
  if (!inputPath) throw new Error("AAWP_INPUT_PATH is required");
  if (!executionDirectory) throw new Error("AAWP_EXECUTION_DIR is required");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const brief = input.brief;
  assert.equal(brief?.schemaVersion, "aawp/spec-to-demo-brief/v1");
  assert.ok(Array.isArray(brief.requestedScreens) && brief.requestedScreens.length > 0);
  const sourceBytes = await readFile(resolve(brief.sourceSpec.path));
  assert.equal(sha256(sourceBytes), brief.sourceSpec.byteSha256, "source spec digest changed");
  const source = JSON.parse(sourceBytes.toString("utf8"));
  const contract = validateDemoSelectionContract(
    brief.selectionContract ?? source.selectionContract,
    brief.requestedScreens
  );
  if (source.selectionContract !== undefined) {
    assert.deepEqual(
      source.selectionContract,
      contract,
      "brief/source selection contract mismatch"
    );
  }
  const artifact = {
    ...contract,
    runId,
    sourceSpec: {
      path: brief.sourceSpec.path,
      byteSha256: brief.sourceSpec.byteSha256
    }
  };
  const outputDirectory = resolve(executionDirectory, "artifacts", "selection");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, "selection-contract.json");
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  if (contract.status !== "ready") throw new Error(selectionFailureMessage(contract));
  return { artifact, outputPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { artifact, outputPath } = await checkSpecToDemoSelection({
    inputPath: process.env.AAWP_INPUT_PATH,
    executionDirectory: process.env.AAWP_EXECUTION_DIR,
    runId: process.env.AAWP_RUN_ID
  });
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: artifact.schemaVersion, status: artifact.status, outputPath })}\n`
  );
}
