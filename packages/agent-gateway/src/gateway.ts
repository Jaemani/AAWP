import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { RuntimeNodeError } from "@awf/runtime-core";
import { GatewayTelemetry, type GatewayTraceContext } from "@awf/telemetry";
import {
  ModelProviderError,
  type ModelMessage,
  type ModelProvider,
  type ModelProviderRequest,
  type ModelProviderResponse,
  type ModelUsage
} from "./provider.js";

export const MODEL_GATEWAY_ERROR_CLASSES = [
  "MODEL_PROVIDER_NOT_FOUND",
  "MODEL_REQUEST_INVALID",
  "MALFORMED_JSON",
  "SCHEMA_VIOLATION",
  "TOKEN_BUDGET_EXCEEDED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_FAILURE",
  "CANCELLED"
] as const;

export interface ModelInvocationRequest extends GatewayTraceContext {
  provider: string;
  model: string;
  messages: ModelMessage[];
  responseSchema: object | boolean;
  maxOutputTokens: number;
  timeoutMs: number;
  redactionValues?: string[];
}

export interface ModelInvocationResult<T = unknown> {
  provider: string;
  modelRevision: string;
  value: T;
  usage: ModelUsage;
}

export class ModelGatewayError extends RuntimeNodeError {
  constructor(errorClass: string, message: string, details?: unknown) {
    super(errorClass, message, details);
    this.name = "ModelGatewayError";
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function validateProviderResponse(response: ModelProviderResponse): void {
  if (
    typeof response.text !== "string" ||
    typeof response.modelRevision !== "string" ||
    response.modelRevision.length === 0 ||
    !isNonNegativeInteger(response.usage.inputTokens) ||
    !isNonNegativeInteger(response.usage.outputTokens)
  ) {
    throw new ModelGatewayError("PROVIDER_FAILURE", "provider returned invalid response metadata");
  }
}

async function invokeWithDeadline(
  provider: ModelProvider,
  request: ModelProviderRequest,
  timeoutMs: number,
  callerSignal?: AbortSignal
): Promise<ModelProviderResponse> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(new Error("provider timeout")),
    timeoutMs
  );
  const signals =
    callerSignal === undefined
      ? [timeoutController.signal]
      : [callerSignal, timeoutController.signal];
  const signal = AbortSignal.any(signals);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason ?? new Error("model invocation aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([provider.invoke(request, signal), aborted]);
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new ModelGatewayError("PROVIDER_TIMEOUT", `provider ${provider.name} timed out`);
    }
    if (callerSignal?.aborted === true) {
      throw new ModelGatewayError("CANCELLED", `provider ${provider.name} invocation cancelled`);
    }
    if (error instanceof ModelProviderError) {
      throw new ModelGatewayError(error.errorClass, error.message, error.details);
    }
    if (error instanceof ModelGatewayError) throw error;
    throw new ModelGatewayError(
      "PROVIDER_FAILURE",
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    clearTimeout(timeout);
    if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
  }
}

export class ModelGateway {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly ajv = new Ajv2020({ allErrors: true, strict: false });

  constructor(
    providers: ModelProvider[],
    private readonly telemetry = new GatewayTelemetry()
  ) {
    for (const provider of providers) {
      if (provider.name.length === 0 || this.providers.has(provider.name)) {
        throw new ModelGatewayError(
          "MODEL_REQUEST_INVALID",
          `provider name must be non-empty and unique: ${provider.name}`
        );
      }
      this.providers.set(provider.name, provider);
    }
  }

  async invoke<T = unknown>(
    request: ModelInvocationRequest,
    callerSignal?: AbortSignal
  ): Promise<ModelInvocationResult<T>> {
    const provider = this.providers.get(request.provider);
    if (provider === undefined) {
      throw new ModelGatewayError(
        "MODEL_PROVIDER_NOT_FOUND",
        `model provider is not registered: ${request.provider}`
      );
    }
    if (
      request.model.length === 0 ||
      !Number.isInteger(request.maxOutputTokens) ||
      request.maxOutputTokens < 1 ||
      !Number.isInteger(request.timeoutMs) ||
      request.timeoutMs < 1
    ) {
      throw new ModelGatewayError("MODEL_REQUEST_INVALID", "model budget and timeout are invalid");
    }

    let validate: ValidateFunction;
    try {
      validate = this.ajv.compile(request.responseSchema as AnySchema);
    } catch (error) {
      throw new ModelGatewayError(
        "MODEL_REQUEST_INVALID",
        `response schema is invalid: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const started = this.telemetry.startModelSpan(request, {
      provider: request.provider,
      model: request.model,
      prompt: request.messages,
      ...(request.redactionValues === undefined ? {} : { redactionValues: request.redactionValues })
    });
    try {
      const providerRequest: ModelProviderRequest = {
        model: request.model,
        messages: request.messages,
        responseSchema: request.responseSchema,
        maxOutputTokens: request.maxOutputTokens
      };
      const response = await invokeWithDeadline(
        provider,
        providerRequest,
        request.timeoutMs,
        callerSignal
      );
      validateProviderResponse(response);
      this.telemetry.recordModelUsage(
        started.span,
        response.usage.inputTokens,
        response.usage.outputTokens
      );
      if (
        response.finishReason === "length" ||
        response.usage.outputTokens > request.maxOutputTokens
      ) {
        throw new ModelGatewayError(
          "TOKEN_BUDGET_EXCEEDED",
          `provider exceeded output token budget ${request.maxOutputTokens}`
        );
      }

      let value: unknown;
      try {
        value = JSON.parse(response.text) as unknown;
      } catch (error) {
        throw new ModelGatewayError(
          "MALFORMED_JSON",
          `provider response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      if (!validate(value)) {
        throw new ModelGatewayError(
          "SCHEMA_VIOLATION",
          "provider response does not match the required schema",
          (validate.errors ?? []) as ErrorObject[]
        );
      }
      this.telemetry.endSuccess(started);
      return {
        provider: provider.name,
        modelRevision: response.modelRevision,
        value: value as T,
        usage: response.usage
      };
    } catch (error) {
      this.telemetry.endError(started, error);
      throw error;
    }
  }
}
