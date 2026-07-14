import { validateWorkflow, type Diagnostic } from "@awf/compiler";
import { canonicalize, sha256Hex } from "@awf/ir";
import {
  validateFixtureInput,
  type RuntimePort,
  type RuntimeRunHandle,
  type RuntimeStartRequest
} from "@awf/runtime-core";
import type { Client } from "@temporalio/client";
import { durableWorkflow } from "./workflows.js";
import type { TemporalRunResult, TemporalWorkflowInput } from "./types.js";

export function temporalWorkflowId(tenantId: string, runId: string): string {
  return `awf-${sha256Hex(canonicalize({ tenantId, runId }))}`;
}

export class RuntimeRequestValidationError extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super("Temporal runtime request contains an invalid workflow");
    this.name = "RuntimeRequestValidationError";
  }
}

export class TemporalRuntimePort implements RuntimePort<TemporalRunResult> {
  readonly name = "temporal";

  constructor(
    private readonly client: Client,
    private readonly taskQueue: string,
    private readonly activityTaskQueue = taskQueue
  ) {}

  async start(request: RuntimeStartRequest): Promise<RuntimeRunHandle<TemporalRunResult>> {
    const validation = validateWorkflow(request.workflow);
    if (!validation.ok) throw new RuntimeRequestValidationError(validation.diagnostics);
    const inputs = validateFixtureInput(request.workflow, request.inputs);
    const workflowInput: TemporalWorkflowInput = {
      ...request,
      inputs,
      activityTaskQueue: this.activityTaskQueue
    };
    const temporalHandle = await this.client.workflow.start(durableWorkflow, {
      workflowId: temporalWorkflowId(request.tenantId, request.runId),
      taskQueue: this.taskQueue,
      args: [workflowInput]
    });
    return {
      runId: request.runId,
      result: () => temporalHandle.result(),
      signal: async (name, payload) => {
        await temporalHandle.signal(name, payload);
      },
      cancel: async () => {
        await temporalHandle.cancel();
      }
    };
  }
}
