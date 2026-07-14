import { RuntimeNodeError } from "@awf/runtime-core";
import { redactText } from "@awf/telemetry";
import type { ToolAdapter, ToolAdapterRequest, ToolCapabilityPlan } from "./gateway.js";
import { SandboxLauncher, type SandboxLimits } from "./sandbox.js";

export interface McpClientPort {
  callTool(request: {
    serverId: string;
    toolName: string;
    input: unknown;
    authorizedSecretRefs: string[];
    signal: AbortSignal;
  }): Promise<unknown>;
}

export interface McpToolAdapterOptions {
  serverId: string;
  toolName: string;
  endpoint?: string;
  secretRefs?: string[];
}

export class McpToolAdapter implements ToolAdapter {
  constructor(
    private readonly client: McpClientPort,
    private readonly options: McpToolAdapterOptions
  ) {}

  plan(): ToolCapabilityPlan {
    return {
      ...(this.options.endpoint === undefined ? {} : { networkUrls: [this.options.endpoint] }),
      ...(this.options.secretRefs === undefined ? {} : { secretRefs: this.options.secretRefs })
    };
  }

  invoke(request: ToolAdapterRequest, signal: AbortSignal): Promise<unknown> {
    return this.client.callTool({
      serverId: this.options.serverId,
      toolName: this.options.toolName,
      input: request.input,
      authorizedSecretRefs: request.capabilities.secretRefs,
      signal
    });
  }
}

export interface CliToolAdapterOptions {
  image: string;
  argv: string[];
  capabilities?: ToolCapabilityPlan;
  limits?: Partial<SandboxLimits>;
}

export class CliToolAdapter implements ToolAdapter {
  constructor(
    private readonly launcher: SandboxLauncher,
    private readonly options: CliToolAdapterOptions
  ) {}

  plan(): ToolCapabilityPlan {
    return this.options.capabilities ?? {};
  }

  async invoke(request: ToolAdapterRequest, signal: AbortSignal): Promise<unknown> {
    const result = await this.launcher.run(
      {
        tenantId: request.tenantId,
        runId: request.runId,
        nodeId: request.nodeId,
        ...(request.artifactIds === undefined ? {} : { artifactIds: request.artifactIds }),
        authorizer: request.authorizer,
        image: this.options.image,
        argv: this.options.argv,
        stdin: JSON.stringify(request.input),
        ...(this.options.capabilities?.filesystemRead === undefined
          ? {}
          : { filesystemRead: this.options.capabilities.filesystemRead }),
        ...(this.options.capabilities?.filesystemWrite === undefined
          ? {}
          : { filesystemWrite: this.options.capabilities.filesystemWrite }),
        ...(this.options.capabilities?.networkUrls === undefined
          ? {}
          : { networkUrls: this.options.capabilities.networkUrls }),
        ...(this.options.capabilities?.secretRefs === undefined
          ? {}
          : { secretRefs: this.options.capabilities.secretRefs }),
        ...(this.options.limits === undefined ? {} : { limits: this.options.limits })
      },
      signal
    );
    if (result.exitCode !== 0) {
      throw new RuntimeNodeError(
        "TOOL_EXECUTION",
        `CLI tool exited ${result.exitCode}: ${redactText(result.stderr, result.redactionValues)}`
      );
    }
    try {
      return JSON.parse(result.stdout) as unknown;
    } catch (error) {
      throw new RuntimeNodeError(
        "VALIDATION",
        `CLI tool returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
