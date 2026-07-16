import { describe, expect, it } from "vitest";
// @ts-expect-error -- repository reverify helper is plain ESM.
import { assertRunId } from "./reverify-spec-to-demo-run.mjs";

describe("spec-to-demo reverify input boundary", () => {
  it("accepts immutable run IDs and rejects path traversal", () => {
    expect(assertRunId("run_7b884b9d-825a-42a4-bd98-d0c92b7fe87d")).toBe(
      "run_7b884b9d-825a-42a4-bd98-d0c92b7fe87d"
    );
    expect(() => assertRunId("../run_bad")).toThrow("invalid run ID");
  });
});
