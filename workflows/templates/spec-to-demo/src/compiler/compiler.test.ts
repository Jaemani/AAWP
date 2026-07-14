import { describe, expect, it } from "vitest";
import { fixtureNames, inputFor, loadFixture } from "../test-helpers.js";
import { compileSpecContracts } from "./index.js";
import { ScopeCompilationError } from "./scope.js";

describe("spec-to-demo contract compilers", () => {
  it("compiles five structurally different fixtures with stable requirement ids", async () => {
    for (const fixtureName of fixtureNames) {
      const document = await loadFixture(fixtureName);
      const first = compileSpecContracts(inputFor(document), document);
      const second = compileSpecContracts(inputFor(document), document);
      expect(first).toEqual(second);
      expect(first.requirements.requirements.length).toBeGreaterThan(0);
      expect(
        first.requirements.requirements.every((item) => /^REQ-[A-F0-9]{12}$/.test(item.id))
      ).toBe(true);
      expect(first.scope.sourceArtifactId).toBe(document.sourceArtifactId);
    }
  });

  it("preserves requirement identity when only requirement wording changes", async () => {
    const document = await loadFixture("checkout");
    const before = compileSpecContracts(inputFor(document), document);
    const revised = structuredClone(document);
    revised.screens[1]!.requirements[0]!.text = "The confirmation heading says Purchase complete.";
    const after = compileSpecContracts(inputFor(revised), revised);
    const beforeRequirement = before.requirements.requirements.find(
      (item) => item.sourceKey === "confirmation-copy"
    )!;
    const afterRequirement = after.requirements.requirements.find(
      (item) => item.sourceKey === "confirmation-copy"
    )!;
    expect(afterRequirement.id).toBe(beforeRequirement.id);
    expect(after.requirements.digest).not.toBe(before.requirements.digest);
  });

  it("selects one requirement without pulling an unrelated screen into scope", async () => {
    const document = await loadFixture("checkout");
    const compiled = compileSpecContracts(
      inputFor(document, { selectedScope: ["confirmation/confirmation-copy"] }),
      document
    );
    expect(compiled.scope.includedScreenIds).toEqual(["confirmation"]);
    expect(compiled.scope.excludedScreenIds).toEqual(["checkout"]);
    expect(compiled.requirements.requirements.map((item) => item.sourceKey)).toEqual([
      "confirmation-copy"
    ]);
  });

  it("fails closed on unknown scope and artifact mismatch", async () => {
    const document = await loadFixture("settings");
    expect(() =>
      compileSpecContracts(inputFor(document, { selectedScope: ["unknown"] }), document)
    ).toThrow(ScopeCompilationError);
    expect(() =>
      compileSpecContracts(inputFor(document, { specArtifactId: "another-artifact" }), document)
    ).toThrowError(expect.objectContaining({ code: "SPEC_ARTIFACT_MISMATCH" }));
  });
});
