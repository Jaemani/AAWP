import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { WorkflowNode } from "@awf/ir";
import {
  CapabilityAuthorizer,
  CapabilityDeniedError,
  type AuthorizedFilesystemPath
} from "@awf/policy";
import { RuntimeNodeError } from "@awf/runtime-core";
import { GatewayTelemetry, type GatewayTraceContext } from "@awf/telemetry";

export type ToolTrustLevel = "trusted" | "restricted" | "untrusted";

export interface ToolCapabilityPlan {
  filesystemRead?: string[];
  filesystemWrite?: string[];
  networkUrls?: string[];
  secretRefs?: string[];
}

export interface AuthorizedToolCapabilities {
  filesystem: AuthorizedFilesystemPath[];
  networkUrls: URL[];
  secretRefs: string[];
}

export interface ToolAdapterRequest extends GatewayTraceContext {
  input: unknown;
  authorizer: CapabilityAuthorizer;
  capabilities: AuthorizedToolCapabilities;
}

export interface ToolAdapter {
  plan(input: unknown): ToolCapabilityPlan | Promise<ToolCapabilityPlan>;
  invoke(request: ToolAdapterRequest, signal: AbortSignal): Promise<unknown>;
}

export interface ToolDefinition {
  id: string;
  trustLevel: ToolTrustLevel;
  inputSchema: object | boolean;
  outputSchema: object | boolean;
  adapter: ToolAdapter;
}

export interface ToolInvocationRequest extends GatewayTraceContext {
  toolId: string;
  input: unknown;
  workspaceRoot: string;
  capabilities: WorkflowNode["capabilities"];
  redactionValues?: string[];
}

export interface ToolInvocationResult<T = unknown> {
  toolId: string;
  trustLevel: ToolTrustLevel;
  tainted: boolean;
  output: T;
}

interface RegisteredTool {
  definition: ToolDefinition;
  validateInput: ValidateFunction;
  validateOutput: ValidateFunction;
}

export class ToolGatewayError extends RuntimeNodeError {
  constructor(errorClass: string, message: string, details?: unknown) {
    super(errorClass, message, details);
    this.name = "ToolGatewayError";
  }
}

async function authorizePlan(
  authorizer: CapabilityAuthorizer,
  plan: ToolCapabilityPlan
): Promise<AuthorizedToolCapabilities> {
  const filesystem: AuthorizedFilesystemPath[] = [];
  for (const path of [...new Set(plan.filesystemRead ?? [])].sort()) {
    filesystem.push(await authorizer.authorizeFilesystem("read", path));
  }
  for (const path of [...new Set(plan.filesystemWrite ?? [])].sort()) {
    filesystem.push(await authorizer.authorizeFilesystem("write", path));
  }
  const networkUrls = [...new Set(plan.networkUrls ?? [])]
    .sort()
    .map((url) => authorizer.authorizeNetwork(url));
  const secretRefs = [...new Set(plan.secretRefs ?? [])].sort();
  for (const reference of secretRefs) authorizer.authorizeSecret(reference);
  return { filesystem, networkUrls, secretRefs };
}

export class ToolGateway {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly ajv = new Ajv2020({ allErrors: true, strict: false });

  constructor(
    definitions: ToolDefinition[],
    private readonly telemetry = new GatewayTelemetry()
  ) {
    for (const definition of definitions) {
      if (definition.id.length === 0 || this.tools.has(definition.id)) {
        throw new ToolGatewayError(
          "VALIDATION",
          `tool ID must be non-empty and unique: ${definition.id}`
        );
      }
      try {
        this.tools.set(definition.id, {
          definition,
          validateInput: this.ajv.compile(definition.inputSchema as AnySchema),
          validateOutput: this.ajv.compile(definition.outputSchema as AnySchema)
        });
      } catch (error) {
        throw new ToolGatewayError(
          "VALIDATION",
          `tool ${definition.id} has invalid schema: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  async invoke<T = unknown>(
    request: ToolInvocationRequest,
    signal: AbortSignal = new AbortController().signal
  ): Promise<ToolInvocationResult<T>> {
    const registered = this.tools.get(request.toolId);
    if (registered === undefined) {
      throw new ToolGatewayError("VALIDATION", `tool is not registered: ${request.toolId}`);
    }
    const started = this.telemetry.startToolSpan(request, {
      toolId: request.toolId,
      trustLevel: registered.definition.trustLevel,
      input: request.input,
      ...(request.redactionValues === undefined ? {} : { redactionValues: request.redactionValues })
    });
    try {
      const authorizer = await CapabilityAuthorizer.create(
        request.workspaceRoot,
        request.capabilities
      );
      authorizer.authorizeTool(request.toolId);
      if (!registered.validateInput(request.input)) {
        throw new ToolGatewayError(
          "VALIDATION",
          `tool ${request.toolId} input schema validation failed`,
          (registered.validateInput.errors ?? []) as ErrorObject[]
        );
      }
      const plan = await registered.definition.adapter.plan(request.input);
      const capabilities = await authorizePlan(authorizer, plan);
      const output = await registered.definition.adapter.invoke(
        {
          tenantId: request.tenantId,
          runId: request.runId,
          nodeId: request.nodeId,
          ...(request.artifactIds === undefined ? {} : { artifactIds: request.artifactIds }),
          input: request.input,
          authorizer,
          capabilities
        },
        signal
      );
      if (!registered.validateOutput(output)) {
        throw new ToolGatewayError(
          "VALIDATION",
          `tool ${request.toolId} output schema validation failed`,
          (registered.validateOutput.errors ?? []) as ErrorObject[]
        );
      }
      this.telemetry.endSuccess(started);
      return {
        toolId: request.toolId,
        trustLevel: registered.definition.trustLevel,
        tainted: registered.definition.trustLevel === "untrusted",
        output: output as T
      };
    } catch (error) {
      const normalized =
        error instanceof CapabilityDeniedError
          ? new ToolGatewayError("AUTHORIZATION", error.message, {
              dimension: error.dimension,
              requested: error.requested
            })
          : error instanceof RuntimeNodeError
            ? error
            : new ToolGatewayError(
                "TOOL_EXECUTION",
                error instanceof Error ? error.message : String(error)
              );
      this.telemetry.endError(started, normalized);
      throw normalized;
    }
  }
}
