import type { ScopeContract } from "./compiler/index.js";
import type { HiddenVerifierPackage } from "./acceptance/index.js";

export interface VerificationCheck {
  id: string;
  phase: "build" | "unit" | "public" | "release";
  runner: "host" | "public_container" | "hidden_container";
  argv: string[];
  evidenceId: string;
  required: boolean;
  broadRegression: boolean;
  productMount: "ro";
  targetViewports?: Array<{ width: number; height: number }>;
}

export interface SpecToDemoVerificationPlan {
  verifierId: string;
  checks: VerificationCheck[];
}

export function createVerificationPlan(
  hiddenPackage: HiddenVerifierPackage,
  scope: ScopeContract
): SpecToDemoVerificationPlan {
  return {
    verifierId: hiddenPackage.verifier.id,
    checks: [
      {
        id: "build",
        phase: "build",
        runner: "host",
        argv: ["npm", "run", "build"],
        evidenceId: "build-report",
        required: true,
        broadRegression: true,
        productMount: "ro"
      },
      {
        id: "unit",
        phase: "unit",
        runner: "host",
        argv: ["npm", "run", "test:unit"],
        evidenceId: "unit-report",
        required: true,
        broadRegression: false,
        productMount: "ro"
      },
      {
        id: "public-e2e",
        phase: "public",
        runner: "public_container",
        argv: ["npm", "run", "test:public"],
        evidenceId: "public-e2e-report",
        required: false,
        broadRegression: false,
        productMount: "ro"
      },
      {
        id: "hidden-e2e",
        phase: "release",
        runner: "hidden_container",
        argv: [...hiddenPackage.verifier.argv],
        evidenceId: "hidden-e2e-report",
        required: true,
        broadRegression: true,
        productMount: "ro"
      },
      {
        id: "screenshot",
        phase: "release",
        runner: "hidden_container",
        argv: [
          "npx",
          "playwright",
          "test",
          "--config=/opt/awf/playwright.config.mjs",
          "--grep",
          "@visual",
          "--reporter=json"
        ],
        evidenceId: "screenshot-report",
        required: true,
        broadRegression: false,
        productMount: "ro",
        targetViewports: scope.targetViewports.map((viewport) => ({ ...viewport }))
      },
      {
        id: "a11y",
        phase: "release",
        runner: "hidden_container",
        argv: [
          "npx",
          "playwright",
          "test",
          "--config=/opt/awf/playwright.config.mjs",
          "--grep",
          "@a11y",
          "--reporter=json"
        ],
        evidenceId: "a11y-report",
        required: true,
        broadRegression: false,
        productMount: "ro"
      }
    ]
  };
}
