import { describe, expect, it } from "vitest";
import { ModelGateway } from "@awf/agent-gateway";
import { LocalObjectCas } from "@awf/artifact-store";
import { validateWorkflow } from "@awf/compiler";
import { diffRevisionStates } from "@awf/impact-engine";
import { digestWorkflow, WorkflowDefinitionSchema } from "@awf/ir";
import { InMemoryArtifactLineage } from "@awf/lineage";
import { CapabilityAuthorizer } from "@awf/policy";
import { simulateDeterministic } from "@awf/runtime-core";
import { TemporalRuntimePort } from "@awf/runtime-temporal";
import { GatewayTelemetry } from "@awf/telemetry";
import { ToolGateway } from "@awf/tool-gateway";
import { evaluateMonotonicCandidate } from "@awf/verifier-sdk";
import { VerifierWorker } from "@awf/verifier-worker";
import { compileSpecContracts } from "@awf/spec-to-demo";

describe("package boundaries", () => {
  it("exposes core APIs through package exports", () => {
    expect(WorkflowDefinitionSchema).toBeDefined();
    expect(digestWorkflow({ ok: true })).toMatch(/^[a-f0-9]{64}$/);
    expect(validateWorkflow).toBeTypeOf("function");
    expect(simulateDeterministic).toBeTypeOf("function");
    expect(LocalObjectCas).toBeTypeOf("function");
    expect(InMemoryArtifactLineage).toBeTypeOf("function");
    expect(TemporalRuntimePort).toBeTypeOf("function");
    expect(CapabilityAuthorizer).toBeTypeOf("function");
    expect(GatewayTelemetry).toBeTypeOf("function");
    expect(ModelGateway).toBeTypeOf("function");
    expect(ToolGateway).toBeTypeOf("function");
    expect(diffRevisionStates).toBeTypeOf("function");
    expect(evaluateMonotonicCandidate).toBeTypeOf("function");
    expect(VerifierWorker).toBeTypeOf("function");
    expect(compileSpecContracts).toBeTypeOf("function");
  });
});
