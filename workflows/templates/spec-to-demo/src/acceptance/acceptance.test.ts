import { describe, expect, it } from "vitest";
import { compileSpecContracts } from "../compiler/index.js";
import { inputFor, loadFixture } from "../test-helpers.js";
import { bindHiddenVerifierImage, compileAcceptance } from "./compiler.js";

describe("acceptance compiler and visibility split", () => {
  it("creates deterministic obligations and a pinned hidden verifier package", async () => {
    const document = await loadFixture("checkout");
    const contracts = compileSpecContracts(inputFor(document), document);
    const first = compileAcceptance({ document, ...contracts });
    const second = compileAcceptance({ document, ...contracts });
    expect(first).toEqual(second);
    expect(first.contract.obligations).toHaveLength(2);
    expect(first.hiddenPackage.verifier).toMatchObject({ visibility: "hidden" });
    expect(
      bindHiddenVerifierImage(
        first.hiddenPackage,
        `registry.example/awf/spec-verifier@sha256:${"9".repeat(64)}`
      ).image
    ).toMatch(/@sha256:[a-f0-9]{64}$/);
    expect(first.hiddenPackage.files.map((file) => file.path)).toEqual([
      "acceptance.json",
      "fixture-protocol.json",
      "hidden.spec.mjs",
      "package.json",
      "playwright.config.mjs"
    ]);
  });

  it("exposes only the fixture protocol while keeping executable oracle source hidden", async () => {
    const document = await loadFixture("catalog");
    const contracts = compileSpecContracts(inputFor(document), document);
    const result = compileAcceptance({ document, ...contracts });
    const publicJson = JSON.stringify(result.publicBrief);
    const hiddenJson = JSON.stringify(result.hiddenPackage);
    expect(publicJson).toContain("catalog-default");
    expect(publicJson).not.toContain("hidden.spec.mjs");
    expect(publicJson).not.toContain("getByRole");
    expect(hiddenJson).toContain("catalog-default");
    expect(hiddenJson).toContain("getByRole");
  });

  it("uses semantic roles rather than generated CSS selectors", async () => {
    const document = await loadFixture("settings");
    const contracts = compileSpecContracts(inputFor(document), document);
    const result = compileAcceptance({ document, ...contracts });
    const source = result.hiddenPackage.files.find(
      (file) => file.path === "hidden.spec.mjs"
    )!.content;
    expect(source).toContain("getByRole");
    expect(source).not.toContain("querySelector");
    expect(source).not.toContain("data-testid");
  });
});
