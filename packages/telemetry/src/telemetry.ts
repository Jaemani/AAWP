import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Exception,
  type Span,
  type Tracer
} from "@opentelemetry/api";

export interface GatewayTraceContext {
  tenantId: string;
  runId: string;
  nodeId: string;
  artifactIds?: string[];
}

export interface GatewayTelemetryOptions {
  captureContent?: boolean;
  tracer?: Tracer;
}

export interface ModelSpanInput {
  provider: string;
  model: string;
  prompt?: unknown;
  redactionValues?: string[];
}

export interface ToolSpanInput {
  toolId: string;
  trustLevel: string;
  input?: unknown;
  redactionValues?: string[];
}

export interface StartedGatewaySpan {
  span: Span;
  redactionValues: string[];
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "[UNSERIALIZABLE]";
  }
}

export function redactText(value: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret.length > 0)
    .sort((left, right) => right.length - left.length)
    .reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), value);
}

function correlationAttributes(context: GatewayTraceContext): Attributes {
  return {
    "awf.tenant.id": context.tenantId,
    "awf.run.id": context.runId,
    "awf.node.id": context.nodeId,
    ...(context.artifactIds === undefined ? {} : { "awf.artifact.ids": context.artifactIds })
  };
}

export class GatewayTelemetry {
  private readonly captureContent: boolean;
  private readonly tracer: Tracer;

  constructor(options: GatewayTelemetryOptions = {}) {
    this.captureContent = options.captureContent ?? false;
    this.tracer = options.tracer ?? trace.getTracer("@awf/gateways");
  }

  startModelSpan(context: GatewayTraceContext, input: ModelSpanInput): StartedGatewaySpan {
    const redactionValues = [...(input.redactionValues ?? [])];
    const attributes: Attributes = {
      ...correlationAttributes(context),
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.provider.name": input.provider,
      "gen_ai.request.model": input.model
    };
    if (this.captureContent && input.prompt !== undefined) {
      attributes["gen_ai.input.messages"] = redactText(
        safeStringify(input.prompt),
        redactionValues
      );
    }
    return {
      span: this.tracer.startSpan("awf.agent.invoke", { attributes }),
      redactionValues
    };
  }

  startToolSpan(context: GatewayTraceContext, input: ToolSpanInput): StartedGatewaySpan {
    const redactionValues = [...(input.redactionValues ?? [])];
    const attributes: Attributes = {
      ...correlationAttributes(context),
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": input.toolId,
      "awf.tool.trust_level": input.trustLevel
    };
    if (this.captureContent && input.input !== undefined) {
      attributes["gen_ai.tool.call.arguments"] = redactText(
        safeStringify(input.input),
        redactionValues
      );
    }
    return {
      span: this.tracer.startSpan("awf.tool.invoke", { attributes }),
      redactionValues
    };
  }

  recordModelUsage(span: Span, inputTokens: number, outputTokens: number): void {
    span.setAttribute("gen_ai.usage.input_tokens", inputTokens);
    span.setAttribute("gen_ai.usage.output_tokens", outputTokens);
  }

  endSuccess(started: StartedGatewaySpan): void {
    started.span.setStatus({ code: SpanStatusCode.OK });
    started.span.end();
  }

  endError(started: StartedGatewaySpan, error: unknown): void {
    const source = error instanceof Error ? error : new Error(String(error));
    const message = redactText(source.message, started.redactionValues);
    const exception: Exception = {
      name: source.name,
      message
    };
    started.span.recordException(exception);
    started.span.setStatus({ code: SpanStatusCode.ERROR, message });
    started.span.end();
  }
}
