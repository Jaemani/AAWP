#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function records(value) {
  return Array.isArray(value) ? value.filter((item) => Object.keys(record(item)).length > 0) : [];
}

function strings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.length > 0)
    : [];
}

function pick(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function stripFeedbackIds(value) {
  if (Array.isArray(value)) return value.map(stripFeedbackIds);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "feedbackIds")
      .map(([key, item]) => [key, stripFeedbackIds(item)])
  );
}

export function compileDemoExecutionContract({ source, selectionContract, sourceSpec, runId }) {
  const requestedSet = new Set(selectionContract.requestedScreens);
  const screens = records(source.screens)
    .filter((screen) => requestedSet.has(screen.id))
    .map((screen) =>
      stripFeedbackIds(
        pick(screen, [
          "id",
          "title",
          "route",
          "surface",
          "layout",
          "components",
          "copy",
          "actors",
          "sharedActors",
          "rolePresentation",
          "actions",
          "dataNeeds",
          "resourceType",
          "policyInstanceBoundary",
          "evidenceCorrection",
          "fileImportPocStages",
          "tableContract",
          "contextContract"
        ])
      )
    );
  const actorIds = new Set(
    screens.flatMap((screen) => [...strings(screen.actors), ...strings(screen.sharedActors)])
  );
  const componentNames = new Set(screens.flatMap((screen) => strings(screen.components)));
  const flowIds = new Set(selectionContract.flowIds);
  const scope = record(source.scope);
  const meta = record(source.meta);
  const authority = record(source.authority);
  const apiContracts = record(source.apiContracts);
  const sourceAcceptance = source.acceptance;
  const acceptanceScenarios = Array.isArray(sourceAcceptance)
    ? records(sourceAcceptance)
    : records(record(sourceAcceptance).scenarios);
  const evidenceCheckIds = new Set(selectionContract.evidenceCheckIds);
  const selectedAcceptance = acceptanceScenarios
    .map((scenario) => ({
      ...scenario,
      evidenceChecks: records(scenario.evidenceChecks).filter((check) =>
        evidenceCheckIds.has(check.id)
      )
    }))
    .filter((scenario) => scenario.evidenceChecks.length > 0);

  return stripFeedbackIds({
    schemaVersion: "aawp/demo-execution-contract/v1",
    runId,
    sourceSpec,
    selectionContract,
    productContext: {
      ...pick(meta, ["scenario", "chosenDirection", "revision"]),
      ...pick(scope, [
        "activeDemoJourneyId",
        "entryScreenId",
        "productSurface",
        "navigationPrinciples"
      ])
    },
    actors: records(source.actors)
      .filter((actor) => actorIds.has(actor.id))
      .map((actor) => ({
        ...pick(actor, [
          "id",
          "role",
          "jurisdiction",
          "surface",
          "authorityScope",
          "separationFrom"
        ]),
        canOperate: strings(actor.canOperate).filter((screenId) => requestedSet.has(screenId))
      })),
    components: records(source.components)
      .filter((component) => componentNames.has(component.name))
      .map((component) => pick(component, ["name", "purpose", "props", "states", "variants"])),
    screens,
    flows: records(source.flows).filter((flow) => flowIds.has(flow.id ?? flow.flowId)),
    stateMachines: records(source.stateMachines),
    apiContracts: pick(apiContracts, [
      "status",
      "blocks",
      "queryContracts",
      "queries",
      "commandContracts",
      "commands",
      "unresolvedContracts"
    ]),
    dataBindings: records(source.dataBindings).filter((binding) =>
      requestedSet.has(binding.screenId)
    ),
    authority: pick(authority, [
      "status",
      "model",
      "serverEnforcement",
      "capabilities",
      "actorCapabilityFixture"
    ]),
    acceptance: Array.isArray(sourceAcceptance)
      ? selectedAcceptance
      : {
          ...pick(record(sourceAcceptance), ["status", "maturityTarget", "note"]),
          scenarios: selectedAcceptance
        },
    demoStoryboard: records(source.demoStoryboard).filter(
      (item) =>
        requestedSet.has(item.screenId) &&
        item.status !== "deprecated" &&
        (selectionContract.activeDemoJourneyId === undefined ||
          item.journeyId === selectionContract.activeDemoJourneyId)
    ),
    mockData: records(source.mockData),
    unresolved: {
      assumptions: records(source.assumptions),
      openQuestions: records(source.openQuestions)
    }
  });
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
      : contract.missingRequiredScreens.length === 0 && contract.unknownScreenTargets.length === 0
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
  const executionContract = compileDemoExecutionContract({
    source,
    selectionContract: contract,
    sourceSpec: artifact.sourceSpec,
    runId
  });
  const executionContractPath = resolve(outputDirectory, "demo-execution-contract.json");
  // This artifact is model-facing and may contain dozens of screens. Keep it canonical and compact;
  // the heavy source Spec remains the human-readable provenance artifact.
  await writeFile(executionContractPath, `${JSON.stringify(executionContract)}\n`, {
    mode: 0o600
  });
  if (contract.status !== "ready") throw new Error(selectionFailureMessage(contract));
  return { artifact, executionContract, executionContractPath, outputPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { artifact, executionContractPath, outputPath } = await checkSpecToDemoSelection({
    inputPath: process.env.AAWP_INPUT_PATH,
    executionDirectory: process.env.AAWP_EXECUTION_DIR,
    runId: process.env.AAWP_RUN_ID
  });
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: artifact.schemaVersion,
      status: artifact.status,
      outputPath,
      executionContractPath
    })}\n`
  );
}
