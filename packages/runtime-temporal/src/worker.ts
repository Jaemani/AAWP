import { fileURLToPath } from "node:url";
import type { NodeExecutor, NodeProjectionSink } from "@awf/runtime-core";
import { Worker, type NativeConnection } from "@temporalio/worker";
import { createTemporalActivities } from "./activities.js";

export interface TemporalWorkerOptions {
  connection: NativeConnection;
  taskQueue: string;
  executor: NodeExecutor;
  projectionSink?: NodeProjectionSink;
  workflowsPath?: string;
}

export async function createTemporalWorker(options: TemporalWorkerOptions): Promise<Worker> {
  return Worker.create({
    connection: options.connection,
    taskQueue: options.taskQueue,
    workflowsPath:
      options.workflowsPath ?? fileURLToPath(new URL("./workflows.js", import.meta.url)),
    activities: createTemporalActivities(options.executor, options.projectionSink),
    shutdownGraceTime: 1000,
    shutdownForceTime: 5000
  });
}
