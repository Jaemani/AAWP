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

  it("expands a resolved topic or flow group into an explicit screen scope", async () => {
    const document = await loadFixture("checkout");
    const topic = compileSpecContracts(
      inputFor(document, {
        scopeSelection: {
          requestText: "구매 시작 화면만 만들어줘",
          groupIds: ["purchase-entry"]
        }
      }),
      document
    );
    expect(topic.scope.includedScreenIds).toEqual(["checkout"]);
    expect(topic.scope.selectedGroupIds).toEqual(["purchase-entry"]);
    expect(topic.scope.requestText).toBe("구매 시작 화면만 만들어줘");

    const flow = compileSpecContracts(
      inputFor(document, {
        scopeSelection: {
          requestText: "구매 플로우 전체를 만들어줘",
          groupIds: ["checkout-flow"]
        }
      }),
      document
    );
    expect(flow.scope.includedScreenIds).toEqual(["checkout", "confirmation"]);
  });

  it("fails closed on unknown scope and artifact mismatch", async () => {
    const document = await loadFixture("settings");
    expect(() =>
      compileSpecContracts(inputFor(document, { selectedScope: ["unknown"] }), document)
    ).toThrow(ScopeCompilationError);
    expect(() =>
      compileSpecContracts(inputFor(document, { specArtifactId: "another-artifact" }), document)
    ).toThrowError(expect.objectContaining({ code: "SPEC_ARTIFACT_MISMATCH" }));
    expect(() =>
      compileSpecContracts(
        inputFor(document, { scopeSelection: { requestText: "정책 화면을 만들어줘" } }),
        document
      )
    ).toThrowError(expect.objectContaining({ code: "UNRESOLVED_SCOPE_REQUEST" }));
    const inputWithoutScope = inputFor(document);
    delete inputWithoutScope.selectedScope;
    expect(() => compileSpecContracts(inputWithoutScope, document)).toThrowError(
      expect.objectContaining({ code: "MISSING_SCOPE_SELECTION" })
    );
  });

  it("fails closed when a group is unknown, invalid, or expands beyond the screen budget", async () => {
    const document = await loadFixture("checkout");
    expect(() =>
      compileSpecContracts(
        inputFor(document, { scopeSelection: { groupIds: ["unknown-flow"] } }),
        document
      )
    ).toThrowError(expect.objectContaining({ code: "UNKNOWN_SCREEN_GROUP" }));
    expect(() =>
      compileSpecContracts(
        inputFor(document, {
          scopeSelection: { groupIds: ["checkout-flow"] },
          constraints: { maxScreens: 1 }
        }),
        document
      )
    ).toThrowError(expect.objectContaining({ code: "MAX_SCREENS_EXCEEDED" }));

    const invalidDocument = structuredClone(document);
    invalidDocument.screenGroups!.push({
      id: "broken-flow",
      title: "Broken flow",
      kind: "flow",
      screenIds: ["missing-screen"]
    });
    expect(() => compileSpecContracts(inputFor(invalidDocument), invalidDocument)).toThrowError(
      expect.objectContaining({ code: "INVALID_SCREEN_GROUP_REFERENCE" })
    );
  });
});
