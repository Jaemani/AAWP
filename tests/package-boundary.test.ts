import { describe, expect, it } from "vitest";
import { digestWorkflow, WorkflowDefinitionSchema } from "@awf/ir";
import { validateWorkflow } from "@awf/compiler";
import { simulateDeterministic } from "@awf/runtime-core";
import { LocalObjectCas } from "@awf/artifact-store";
import { InMemoryArtifactLineage } from "@awf/lineage";
import { TemporalRuntimePort } from "@awf/runtime-temporal";

describe("package boundaries", () => {
  it("exposes core APIs through package exports", () => {
    expect(WorkflowDefinitionSchema).toBeDefined();
    expect(digestWorkflow({ ok: true })).toMatch(/^[a-f0-9]{64}$/);
    expect(validateWorkflow).toBeTypeOf("function");
    expect(simulateDeterministic).toBeTypeOf("function");
    expect(LocalObjectCas).toBeTypeOf("function");
    expect(InMemoryArtifactLineage).toBeTypeOf("function");
    expect(TemporalRuntimePort).toBeTypeOf("function");
  });
});
