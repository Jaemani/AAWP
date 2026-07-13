import { describe, expect, it } from "vitest";
import { digestWorkflow, WorkflowDefinitionSchema } from "@awf/ir";
import { validateWorkflow } from "@awf/compiler";
import { simulateDeterministic } from "@awf/runtime-core";

describe("package boundaries", () => {
  it("exposes IR, compiler, and runtime APIs through package exports", () => {
    expect(WorkflowDefinitionSchema).toBeDefined();
    expect(digestWorkflow({ ok: true })).toMatch(/^[a-f0-9]{64}$/);
    expect(validateWorkflow).toBeTypeOf("function");
    expect(simulateDeterministic).toBeTypeOf("function");
  });
});
