import { canonicalize, digestWorkflow, sha256Hex } from "@awf/ir";
import { parseVerifierDefinition, type VerifierDefinition } from "@awf/verifier-sdk";
import type { RequirementContract, ScopeContract, SpecDocument } from "../compiler/index.js";
import type {
  AcceptanceCompilation,
  AcceptanceContract,
  AcceptanceObligation,
  HiddenVerifierFile,
  HiddenVerifierPackage,
  PublicImplementationBrief
} from "./types.js";

const HIDDEN_RUNNER = String.raw`import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

const contract = JSON.parse(await readFile("/opt/awf/acceptance.json", "utf8"));
let fixtureBundle = { records: [] };
try { fixtureBundle = JSON.parse(await readFile("/opt/awf/fixtures.json", "utf8")); } catch {}
for (const obligation of contract.obligations) {
  const tags = [
    obligation.oracles.some((oracle) => oracle.type === "visual") ? "@visual" : "",
    obligation.oracles.some((oracle) => oracle.type === "a11y") ? "@a11y" : ""
  ].filter(Boolean).join(" ");
  test([obligation.id, tags].filter(Boolean).join(" "), async ({ page }) => {
    const fixtureRefs = [...new Set([
      ...obligation.preconditions.map((item) => item.fixture).filter(Boolean),
      ...obligation.actions.filter((item) => item.actor === "external_system").map((item) => item.fixtureRef)
    ])];
    for (const fixtureRef of fixtureRefs) {
      const fixture = fixtureBundle.records.find((record) => record.key === fixtureRef);
      if (fixture === undefined) throw new Error("missing fixture " + fixtureRef);
      await page.route("**/__awf/fixtures/" + fixtureRef, async (route) => {
        await route.fulfill({ status: fixture.status ?? 200, json: fixture.payload });
      });
    }
    await page.goto(obligation.route);
    for (const action of obligation.actions) {
      if (action.actor === "external_system") continue;
      if (action.operation === "visit") await page.goto(action.value ?? obligation.route);
      if (action.operation === "click" || action.operation === "submit") {
        await page.getByRole(action.targetSemanticRole, { name: action.accessibleName }).click();
      }
      if (action.operation === "type") {
        await page.getByRole(action.targetSemanticRole, { name: action.accessibleName }).fill(action.value ?? "");
      }
      if (action.operation === "select") {
        await page.getByRole(action.targetSemanticRole, { name: action.accessibleName }).selectOption(action.value ?? "");
      }
    }
    for (const oracle of obligation.oracles) {
      const value = oracle.assertion;
      if (oracle.type === "dom") {
        const target = page.getByRole(value.role, { name: value.name });
        if (value.text !== undefined) await expect(target).toContainText(value.text);
        else await expect(target).toBeVisible();
      }
      if (oracle.type === "navigation") await expect(page).toHaveURL(value.path);
      if (oracle.type === "state") {
        const stored = await page.evaluate((key) => localStorage.getItem(key), value.key);
        expect(stored).toBe(value.value);
      }
      if (oracle.type === "network") {
        const fixture = fixtureBundle.records.find((record) => record.key === value.fixtureRef);
        if (fixture === undefined) throw new Error("missing fixture " + value.fixtureRef);
        expect(fixture.status ?? 200).toBe(value.status);
      }
      if (oracle.type === "visual") await expect(page).toHaveScreenshot(value.name);
      if (oracle.type === "a11y") {
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      }
    }
  });
}
`;

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function obligationId(requirementId: string): string {
  return `ACC-${sha256Hex(requirementId).slice(0, 12).toUpperCase()}`;
}

function collectFixtureKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const child of value) collectFixtureKeys(child, keys);
    return keys;
  }
  if (typeof value !== "object" || value === null) return keys;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "fixture" || key === "fixtureRef") && typeof child === "string") keys.add(child);
    else collectFixtureKeys(child, keys);
  }
  return keys;
}

export function compileAcceptanceContract(
  requirements: RequirementContract,
  scope: ScopeContract
): AcceptanceContract {
  const obligations: AcceptanceObligation[] = requirements.requirements.map((requirement) => ({
    id: obligationId(requirement.id),
    requirementId: requirement.id,
    route: requirement.route,
    preconditions: requirement.preconditions.map((item) => ({ ...item })),
    actions: requirement.actions.map((action) => ({
      actor: action.fixtureRef === undefined ? ("user" as const) : ("external_system" as const),
      operation: action.operation,
      ...(action.role === undefined ? {} : { targetSemanticRole: action.role }),
      ...(action.name === undefined ? {} : { accessibleName: action.name }),
      ...(action.value === undefined ? {} : { value: action.value }),
      ...(action.fixtureRef === undefined ? {} : { fixtureRef: action.fixtureRef })
    })),
    oracles: requirement.oracles.map((oracle) => ({
      type: oracle.type,
      assertion: { ...oracle.assertion }
    }))
  }));
  obligations.sort((left, right) => utf16(left.id, right.id));
  const content = {
    contractType: "acceptance" as const,
    requirementContractDigest: requirements.digest,
    scopeContractDigest: scope.digest,
    obligations
  };
  return { ...content, digest: digestWorkflow(content) };
}

export function createPublicBrief(
  document: SpecDocument,
  requirements: RequirementContract,
  scope: ScopeContract
): PublicImplementationBrief {
  const fixtureKeys = [
    ...collectFixtureKeys(
      requirements.requirements.map((requirement) => ({
        preconditions: requirement.preconditions,
        actions: requirement.actions,
        oracles: requirement.oracles
      }))
    )
  ].sort(utf16);
  const content = {
    briefType: "spec-to-demo-public" as const,
    title: document.title,
    requirements: requirements.requirements.map((requirement) => ({
      id: requirement.id,
      screenId: requirement.screenId,
      screenTitle: requirement.screenTitle,
      route: requirement.route,
      text: requirement.text,
      publicCriterion: requirement.publicCriterion
    })),
    includedScreenIds: [...scope.includedScreenIds],
    allowedWrites: [...scope.allowedWrites],
    forbiddenDependencies: [...scope.forbiddenDependencies],
    targetViewports: scope.targetViewports.map((viewport) => ({ ...viewport })),
    accessibilityLevel: scope.accessibilityLevel,
    fixtureProtocol: {
      version: "awf/fixture/v1" as const,
      endpoint: "/__awf/fixtures/:key" as const,
      keys: fixtureKeys
    }
  };
  return { ...content, digest: digestWorkflow(content) };
}

function hiddenFiles(contract: AcceptanceContract): HiddenVerifierFile[] {
  const manifest = {
    name: "awf-spec-to-demo-hidden-verifier",
    private: true,
    type: "module",
    dependencies: {
      "@axe-core/playwright": "4.10.2",
      "@playwright/test": "1.55.1"
    }
  };
  const rawFiles = [
    { path: "acceptance.json", content: canonicalize(contract) },
    {
      path: "fixture-protocol.json",
      content: canonicalize({
        version: "awf/fixture/v1",
        mount: "/opt/awf/fixtures.json",
        requiredKeys: [...collectFixtureKeys(contract.obligations)].sort(utf16)
      })
    },
    { path: "hidden.spec.mjs", content: HIDDEN_RUNNER },
    {
      path: "playwright.config.mjs",
      content:
        'import { defineConfig } from "@playwright/test";\nexport default defineConfig({ testDir: "/opt/awf", outputDir: "/workspace/evidence/playwright", use: { baseURL: "http://127.0.0.1:4173" }, webServer: { command: "npm run preview -- --host 127.0.0.1 --port 4173", cwd: "/workspace/product", url: "http://127.0.0.1:4173", reuseExistingServer: false } });\n'
    },
    { path: "package.json", content: canonicalize(manifest) }
  ];
  return rawFiles
    .map((file) => ({ ...file, contentHash: sha256Hex(file.content) }))
    .sort((left, right) => utf16(left.path, right.path));
}

export function packageHiddenVerifier(contract: AcceptanceContract): HiddenVerifierPackage {
  const files = hiddenFiles(contract);
  const packageDigest = digestWorkflow(
    files.map((file) => ({ path: file.path, contentHash: file.contentHash }))
  );
  return {
    packageType: "spec-to-demo-hidden",
    packageDigest,
    acceptanceContractDigest: contract.digest,
    verifier: {
      id: "spec-to-demo-hidden",
      version: "1.0.0",
      ownerId: "runtime-acceptance",
      visibility: "hidden",
      argv: [
        "npx",
        "playwright",
        "test",
        "/opt/awf/hidden.spec.mjs",
        "--config=/opt/awf/playwright.config.mjs",
        "--reporter=json"
      ],
      policyDigest: digestWorkflow({
        verifierId: "spec-to-demo-hidden",
        acceptanceContractDigest: contract.digest,
        evidencePolicy: "m7-v1"
      }),
      requiredEvidenceIds: [
        "build-report",
        "unit-report",
        "hidden-e2e-report",
        "screenshot-report",
        "a11y-report"
      ]
    },
    files
  };
}

export function bindHiddenVerifierImage(
  hiddenPackage: HiddenVerifierPackage,
  image: string
): VerifierDefinition {
  return parseVerifierDefinition({ ...hiddenPackage.verifier, image });
}

export function compileAcceptance(input: {
  document: SpecDocument;
  requirements: RequirementContract;
  scope: ScopeContract;
}): AcceptanceCompilation {
  const contract = compileAcceptanceContract(input.requirements, input.scope);
  return {
    contract,
    publicBrief: createPublicBrief(input.document, input.requirements, input.scope),
    hiddenPackage: packageHiddenVerifier(contract)
  };
}
