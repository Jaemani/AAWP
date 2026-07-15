import { validateWorkflow } from "@awf/compiler";
import { createEvidenceBundle, type Finding } from "@awf/verifier-sdk";
import { describe, expect, it } from "vitest";
import { bindHiddenVerifierImage, compileAcceptance } from "./acceptance/index.js";
import { compileSpecContracts } from "./compiler/index.js";
import { packageDemoDelivery } from "./delivery.js";
import { createFixtureBundle, FixtureProtocolError } from "./fixture.js";
import { prepareSpecToDemo } from "./pipeline.js";
import { BoundedRepairController, RepairLoopError } from "./repair.js";
import {
  runOneRequirementRevisionBenchmark,
  specToDemoRevisionWorkflow
} from "./revision-benchmark.js";
import { inputFor, loadFixture } from "./test-helpers.js";
import { createVerificationPlan } from "./verification.js";

function productFinding(): Finding {
  return {
    id: "finding-checkout",
    verifierId: "spec-to-demo-hidden",
    class: "product_defect",
    severity: "blocking",
    reasonCode: "CONFIRMATION_COPY",
    evidenceArtifactIds: [],
    affectedPaths: ["src/App.tsx"],
    allowedRepairWrites: ["src/**"],
    status: "open"
  };
}

describe("spec-to-demo vertical slice policies", () => {
  it("prepares all five fixtures through contracts, acceptance, scaffold and verification", async () => {
    for (const name of ["checkout", "settings", "dashboard", "onboarding", "catalog"] as const) {
      const document = await loadFixture(name);
      const prepared = prepareSpecToDemo(inputFor(document), document);
      expect(prepared.contracts.requirements.requirements.length).toBeGreaterThan(0);
      expect(prepared.acceptance.hiddenPackage.verifier.visibility).toBe("hidden");
      expect(prepared.scaffold.files.some((file) => file.path === "src/App.tsx")).toBe(true);
      expect(prepared.verificationPlan.checks).toHaveLength(6);
      expect(prepared.bundleManifest.screens.map((screen) => screen.id)).toEqual(
        prepared.contracts.scope.includedScreenIds
      );
      expect(prepared.bundleManifest.digest).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("defines build, unit, public, hidden, screenshot and accessibility checks", async () => {
    const document = await loadFixture("checkout");
    const contracts = compileSpecContracts(inputFor(document), document);
    const acceptance = compileAcceptance({ document, ...contracts });
    const plan = createVerificationPlan(acceptance.hiddenPackage, contracts.scope);
    expect(plan.checks.map((check) => check.id)).toEqual([
      "build",
      "unit",
      "public-e2e",
      "hidden-e2e",
      "screenshot",
      "a11y"
    ]);
    expect(plan.checks.every((check) => check.productMount === "ro")).toBe(true);
    expect(plan.checks.filter((check) => check.required).map((check) => check.evidenceId)).toEqual(
      acceptance.hiddenPackage.verifier.requiredEvidenceIds
    );
  });

  it("bounds repair rounds, repeated findings and write authority", () => {
    const controller = new BoundedRepairController({ maxRounds: 2, maxRepeatedFinding: 1 });
    expect(
      controller.authorize({
        findings: [productFinding()],
        actorRole: "builder",
        requestedWrites: ["src/App.tsx"]
      })
    ).toMatchObject({ round: 1, allowedWrites: ["src/**"] });
    expect(() =>
      controller.authorize({
        findings: [productFinding()],
        actorRole: "builder",
        requestedWrites: ["src/App.tsx"]
      })
    ).toThrowError(expect.objectContaining({ code: "REPEATED_FINDING_LIMIT" }));
    expect(() =>
      new BoundedRepairController({ maxRounds: 1, maxRepeatedFinding: 1 }).authorize({
        findings: [{ ...productFinding(), class: "policy_violation" }],
        actorRole: "builder",
        requestedWrites: []
      })
    ).toThrow(RepairLoopError);
  });

  it("requires exactly the runtime-owned fixtures declared by acceptance", async () => {
    const document = await loadFixture("catalog");
    const contracts = compileSpecContracts(inputFor(document), document);
    const acceptance = compileAcceptance({ document, ...contracts });
    expect(() => createFixtureBundle(acceptance.contract, [])).toThrow(FixtureProtocolError);
    const bundle = createFixtureBundle(acceptance.contract, [
      {
        key: "catalog-default",
        phase: "setup",
        status: 200,
        payload: { products: [{ name: "Notebook" }] }
      }
    ]);
    expect(bundle.records).toHaveLength(1);
    expect(bundle.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("packages only evidence bound to the candidate branch and product digest", async () => {
    const document = await loadFixture("settings");
    const prepared = prepareSpecToDemo(inputFor(document), document);
    const verifier = bindHiddenVerifierImage(
      prepared.acceptance.hiddenPackage,
      `registry.example/awf/spec-verifier@sha256:${"8".repeat(64)}`
    );
    const evidenceItems = verifier.requiredEvidenceIds.map((id, index) => ({
      id,
      kind: "test_report" as const,
      artifactId: `artifact-${id}`,
      contentHash: String(index + 1).repeat(64),
      required: true
    }));
    const evidence = createEvidenceBundle({
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "candidate",
      productArtifactId: "artifact-product",
      verifier,
      startedAt: "2026-07-14T00:00:00.000Z",
      completedAt: "2026-07-14T00:00:01.000Z",
      result: {
        outcome: "passed",
        productContentHash: prepared.scaffold.digest,
        findings: [],
        gates: evidenceItems.map((item) => ({
          id: item.id,
          hard: true,
          status: "passed",
          evidenceArtifactIds: [item.artifactId]
        })),
        evidence: evidenceItems,
        observedWrites: [],
        scopeViolationCount: 0,
        costUsd: 0,
        latencyMs: 1000
      }
    });
    const delivery = packageDemoDelivery({
      prepared,
      workspace: prepared.scaffold,
      tenantId: "tenant-a",
      runId: "run-a",
      branchId: "candidate",
      evidence: [evidence]
    });
    expect(delivery.evidenceBundleIds).toEqual([evidence.bundleId]);
    expect(delivery.passedRequirementIds).toHaveLength(2);
  });

  it("reuses unrelated artifacts and reruns broad regression for one requirement change", () => {
    expect(validateWorkflow(specToDemoRevisionWorkflow()).ok).toBe(true);
    const result = runOneRequirementRevisionBenchmark();
    expect(result.reusedNodeIds).toEqual(["assets", "dependency-install", "scaffold"]);
    expect(result.rerunNodeIds).toEqual([
      "a11y",
      "broad-smoke",
      "coherent-builder",
      "compile-acceptance",
      "compile-requirements",
      "hidden-e2e",
      "public-e2e",
      "screenshot",
      "unit"
    ]);
    expect(result.explanations.find((line) => line.startsWith("broad-smoke"))).toContain(
      "BROAD_REGRESSION"
    );
    expect(result.parentPreserved).toBe(true);
  });
});
