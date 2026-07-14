import { describe, expect, it } from "vitest";
import { ModelGateway, ModelGatewayError, type ModelInvocationRequest } from "./gateway.js";
import { ModelProviderError, type ModelProvider, type ModelProviderResponse } from "./provider.js";

const validResponse: ModelProviderResponse = {
  text: JSON.stringify({ answer: "ok" }),
  modelRevision: "model-2026-07-14",
  usage: { inputTokens: 4, outputTokens: 2 },
  finishReason: "stop"
};

function provider(
  name: string,
  invoke: ModelProvider["invoke"] = async () => validResponse
): ModelProvider {
  return { name, invoke };
}

function request(overrides: Partial<ModelInvocationRequest> = {}): ModelInvocationRequest {
  return {
    tenantId: "tenant-a",
    runId: "run-a",
    nodeId: "node-a",
    provider: "provider-a",
    model: "model-a",
    messages: [{ role: "user", content: "answer" }],
    responseSchema: {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
      additionalProperties: false
    },
    maxOutputTokens: 10,
    timeoutMs: 100,
    ...overrides
  };
}

describe("ModelGateway", () => {
  it("supports provider-neutral selection", async () => {
    const gateway = new ModelGateway([
      provider("provider-a"),
      provider("provider-b", async () => ({ ...validResponse, text: '{"answer":"b"}' }))
    ]);
    await expect(gateway.invoke<{ answer: string }>(request())).resolves.toMatchObject({
      provider: "provider-a",
      value: { answer: "ok" }
    });
    await expect(
      gateway.invoke<{ answer: string }>(request({ provider: "provider-b" }))
    ).resolves.toMatchObject({ provider: "provider-b", value: { answer: "b" } });
  });

  it("fails closed on malformed JSON", async () => {
    const gateway = new ModelGateway([
      provider("provider-a", async () => ({ ...validResponse, text: "{" }))
    ]);
    await expect(gateway.invoke(request())).rejects.toMatchObject({
      errorClass: "MALFORMED_JSON"
    });
  });

  it("fails closed on response schema violation", async () => {
    const gateway = new ModelGateway([
      provider("provider-a", async () => ({ ...validResponse, text: '{"answer":3}' }))
    ]);
    await expect(gateway.invoke(request())).rejects.toMatchObject({
      errorClass: "SCHEMA_VIOLATION"
    });
  });

  it("enforces provider timeout even when the provider does not cooperate", async () => {
    const gateway = new ModelGateway([
      provider("provider-a", () => new Promise<ModelProviderResponse>(() => undefined))
    ]);
    await expect(gateway.invoke(request({ timeoutMs: 10 }))).rejects.toMatchObject({
      errorClass: "PROVIDER_TIMEOUT"
    });
  });

  it("rejects output that exceeds the token budget", async () => {
    const gateway = new ModelGateway([
      provider("provider-a", async () => ({
        ...validResponse,
        usage: { inputTokens: 4, outputTokens: 11 }
      }))
    ]);
    await expect(gateway.invoke(request())).rejects.toMatchObject({
      errorClass: "TOKEN_BUDGET_EXCEEDED"
    });
  });

  it("normalizes provider error classes for runtime retry policy", async () => {
    const gateway = new ModelGateway([
      provider("provider-a", async () => {
        throw new ModelProviderError("CAPACITY", "provider busy");
      })
    ]);
    await expect(gateway.invoke(request())).rejects.toMatchObject({
      name: "ModelGatewayError",
      errorClass: "CAPACITY",
      message: "provider busy"
    } satisfies Partial<ModelGatewayError>);
  });
});
