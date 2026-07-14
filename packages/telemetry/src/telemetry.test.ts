import type { Attributes, Exception, Span, Tracer } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import { GatewayTelemetry } from "./telemetry.js";

interface RecordedSpan {
  attributes: Attributes;
  exceptions: Exception[];
  ended: boolean;
}

function recorder(): { tracer: Tracer; spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const tracer = {
    startSpan: (_name: string, options?: { attributes?: Attributes }) => {
      const recorded: RecordedSpan = {
        attributes: { ...(options?.attributes ?? {}) },
        exceptions: [],
        ended: false
      };
      spans.push(recorded);
      return {
        setAttribute(name: string, value: unknown) {
          recorded.attributes[name] = value as never;
          return this;
        },
        setStatus() {
          return this;
        },
        recordException(exception: Exception) {
          recorded.exceptions.push(exception);
        },
        end() {
          recorded.ended = true;
        }
      } as unknown as Span;
    }
  } as unknown as Tracer;
  return { tracer, spans };
}

const context = {
  tenantId: "tenant-a",
  runId: "run-a",
  nodeId: "node-a",
  artifactIds: ["artifact-a"]
};

describe("GatewayTelemetry", () => {
  it("keeps prompt and tool content disabled by default", () => {
    const { tracer, spans } = recorder();
    const telemetry = new GatewayTelemetry({ tracer });
    telemetry.startModelSpan(context, { provider: "test", model: "model", prompt: "private" });
    telemetry.startToolSpan(context, {
      toolId: "search",
      trustLevel: "untrusted",
      input: "private"
    });
    expect(spans[0]?.attributes["gen_ai.input.messages"]).toBeUndefined();
    expect(spans[1]?.attributes["gen_ai.tool.call.arguments"]).toBeUndefined();
  });

  it("redacts registered secrets when content capture is explicitly enabled", () => {
    const { tracer, spans } = recorder();
    const telemetry = new GatewayTelemetry({ tracer, captureContent: true });
    const started = telemetry.startModelSpan(context, {
      provider: "test",
      model: "model",
      prompt: "token secret-value",
      redactionValues: ["secret-value"]
    });
    telemetry.endError(started, new Error("provider echoed secret-value"));
    expect(spans[0]?.attributes["gen_ai.input.messages"]).toContain("[REDACTED]");
    expect(spans[0]?.attributes["gen_ai.input.messages"]).not.toContain("secret-value");
    expect(spans[0]?.exceptions[0]).toMatchObject({ message: "provider echoed [REDACTED]" });
  });

  it("records run, node and artifact correlation without content", () => {
    const { tracer, spans } = recorder();
    const telemetry = new GatewayTelemetry({ tracer });
    telemetry.startModelSpan(context, { provider: "test", model: "model" });
    expect(spans[0]?.attributes).toMatchObject({
      "awf.tenant.id": "tenant-a",
      "awf.run.id": "run-a",
      "awf.node.id": "node-a",
      "awf.artifact.ids": ["artifact-a"]
    });
  });
});
