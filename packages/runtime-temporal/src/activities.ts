import { Context, activityInfo } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import { RuntimeNodeError, type NodeExecutor, type NodeProjectionSink } from "@awf/runtime-core";
import type { TemporalActivities } from "./types.js";

export function createTemporalActivities(
  executor: NodeExecutor,
  projectionSink?: NodeProjectionSink
): TemporalActivities {
  return {
    async executeNode(input) {
      const context = Context.current();
      const heartbeat = setInterval(() => context.heartbeat(), 100);
      try {
        return await executor.execute(
          {
            tenantId: input.tenantId,
            runId: input.runId,
            node: input.node,
            inputs: input.inputs,
            attempt: activityInfo().attempt,
            ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey })
          },
          context.cancellationSignal
        );
      } catch (error) {
        if (error instanceof RuntimeNodeError) {
          throw ApplicationFailure.create({
            message: error.message,
            type: error.errorClass,
            nonRetryable: !input.node.retryPolicy.retryableClasses.includes(error.errorClass),
            ...(error.details === undefined ? {} : { details: [error.details] })
          });
        }
        throw error;
      } finally {
        clearInterval(heartbeat);
      }
    },

    async projectNodeCompletion(input) {
      if (projectionSink === undefined) return;
      const context = Context.current();
      const heartbeat = setInterval(() => context.heartbeat(), 100);
      try {
        await projectionSink.record(input, context.cancellationSignal);
      } finally {
        clearInterval(heartbeat);
      }
    }
  };
}
