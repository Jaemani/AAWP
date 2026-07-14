import { digestWorkflow } from "@awf/ir";
import {
  missingRequiredEvidence,
  verifyEvidenceBundleIntegrity,
  type EvidenceBundle
} from "@awf/verifier-sdk";
import type { PreparedSpecToDemo } from "./pipeline.js";
import type { GeneratedWorkspace } from "./scaffold.js";

export interface DemoDeliveryBundle {
  bundleType: "spec-to-demo-delivery";
  tenantId: string;
  runId: string;
  branchId: string;
  productWorkspaceDigest: string;
  publicBriefDigest: string;
  acceptanceContractDigest: string;
  hiddenVerifierPackageDigest: string;
  evidenceBundleIds: string[];
  passedRequirementIds: string[];
  digest: string;
}

export class DemoDeliveryError extends Error {
  constructor(
    readonly code:
      | "HIDDEN_SOURCE_IN_PRODUCT"
      | "EVIDENCE_RUN_MISMATCH"
      | "EVIDENCE_BRANCH_MISMATCH"
      | "EVIDENCE_PRODUCT_MISMATCH"
      | "VERIFIER_MISMATCH"
      | "RELEASE_NOT_PASSED"
      | "REQUIRED_EVIDENCE_MISSING",
    message: string
  ) {
    super(message);
    this.name = "DemoDeliveryError";
  }
}

export function packageDemoDelivery(input: {
  prepared: PreparedSpecToDemo;
  workspace: GeneratedWorkspace;
  tenantId: string;
  runId: string;
  branchId: string;
  evidence: EvidenceBundle[];
}): DemoDeliveryBundle {
  if (
    input.workspace.files.some(
      (file) => file.path.startsWith("verifier-hidden/") || file.path.includes("hidden.spec")
    )
  ) {
    throw new DemoDeliveryError(
      "HIDDEN_SOURCE_IN_PRODUCT",
      "product workspace contains hidden verifier source"
    );
  }
  const requiredVerifier = input.prepared.acceptance.hiddenPackage.verifier;
  for (const bundle of input.evidence) {
    verifyEvidenceBundleIntegrity(bundle);
    if (bundle.tenantId !== input.tenantId || bundle.runId !== input.runId) {
      throw new DemoDeliveryError(
        "EVIDENCE_RUN_MISMATCH",
        `evidence ${bundle.bundleId} belongs to another run`
      );
    }
    if (bundle.branchId !== input.branchId) {
      throw new DemoDeliveryError(
        "EVIDENCE_BRANCH_MISMATCH",
        `evidence ${bundle.bundleId} belongs to ${bundle.branchId}`
      );
    }
    if (bundle.result.productContentHash !== input.workspace.digest) {
      throw new DemoDeliveryError(
        "EVIDENCE_PRODUCT_MISMATCH",
        `evidence ${bundle.bundleId} verified another product`
      );
    }
    if (
      bundle.verifier.id !== requiredVerifier.id ||
      bundle.verifier.version !== requiredVerifier.version ||
      bundle.verifier.ownerId !== requiredVerifier.ownerId ||
      bundle.verifier.visibility !== requiredVerifier.visibility ||
      bundle.verifier.policyDigest !== requiredVerifier.policyDigest
    ) {
      throw new DemoDeliveryError("VERIFIER_MISMATCH", `unexpected verifier ${bundle.verifier.id}`);
    }
    if (
      bundle.result.outcome !== "passed" ||
      bundle.result.findings.some(
        (finding) => finding.status === "open" && finding.severity === "blocking"
      )
    ) {
      throw new DemoDeliveryError(
        "RELEASE_NOT_PASSED",
        `verifier ${bundle.verifier.id} did not pass`
      );
    }
    const missing = missingRequiredEvidence(bundle);
    if (missing.length > 0) {
      throw new DemoDeliveryError(
        "REQUIRED_EVIDENCE_MISSING",
        `missing evidence ${missing.join(",")}`
      );
    }
  }
  if (input.evidence.length === 0) {
    throw new DemoDeliveryError("RELEASE_NOT_PASSED", "delivery requires verifier evidence");
  }
  const content = {
    bundleType: "spec-to-demo-delivery" as const,
    tenantId: input.tenantId,
    runId: input.runId,
    branchId: input.branchId,
    productWorkspaceDigest: input.workspace.digest,
    publicBriefDigest: input.prepared.acceptance.publicBrief.digest,
    acceptanceContractDigest: input.prepared.acceptance.contract.digest,
    hiddenVerifierPackageDigest: input.prepared.acceptance.hiddenPackage.packageDigest,
    evidenceBundleIds: input.evidence.map((bundle) => bundle.bundleId).sort(),
    passedRequirementIds: input.prepared.contracts.requirements.requirements
      .map((requirement) => requirement.id)
      .sort()
  };
  return { ...content, digest: digestWorkflow(content) };
}
