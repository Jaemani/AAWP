import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { digestWorkflow } from "@awf/ir";
import {
  compileSpecFeedbackContract,
  createHeavyProductionSpecValidator,
  parseSpecFeedbackIntent
} from "@awf/spec-feedback-to-spec";

const source = JSON.parse(
  await readFile(
    "examples/heavy-spec-feedback-revision/generated/refined-production-spec.role-workspaces.candidate.json",
    "utf8"
  )
) as unknown;
const storedIntent = JSON.parse(
  await readFile("examples/heavy-spec-feedback-revision/feedback-intent.json", "utf8")
) as Record<string, unknown>;
const intent = parseSpecFeedbackIntent({ ...storedIntent, sourceDigest: digestWorkflow(source) });

describe("heavy spec feedback intent", () => {
  it("pins an explicit source fixture and compiles 13 stable feedback IDs", () => {
    const contract = compileSpecFeedbackContract(intent, source);

    expect(intent.sourceDigest).toBe(digestWorkflow(source));
    expect(contract.feedbackIds).toHaveLength(13);
    expect(new Set(contract.feedbackIds).size).toBe(13);
    expect(contract.allowRemove).toBe(false);
    expect(contract.allowedPathPrefixes).not.toContain("/designTokens");
    expect(contract.allowedPathPrefixes).not.toContain("/extendedDesign");
  });

  it("passes the heavy profile before generating a child candidate", () => {
    expect(createHeavyProductionSpecValidator(source)(source)).toEqual([]);
  });
});
