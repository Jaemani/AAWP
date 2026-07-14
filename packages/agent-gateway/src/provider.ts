export type ModelMessageRole = "system" | "user" | "assistant" | "tool";

export interface ModelMessage {
  role: ModelMessageRole;
  content: string;
}

export interface ModelProviderRequest {
  model: string;
  messages: ModelMessage[];
  responseSchema: object | boolean;
  maxOutputTokens: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelProviderResponse {
  text: string;
  modelRevision: string;
  usage: ModelUsage;
  finishReason: "stop" | "length" | "tool" | "other";
}

export interface ModelProvider {
  readonly name: string;
  invoke(request: ModelProviderRequest, signal: AbortSignal): Promise<ModelProviderResponse>;
}

export class ModelProviderError extends Error {
  constructor(
    readonly errorClass: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}
