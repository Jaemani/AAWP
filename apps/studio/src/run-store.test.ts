import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeStudioRun, JsonlStudioRunStore } from "./run-store.js";
import { loadStudioInputs, loadWorkflowDocument } from "./server.js";

let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("Studio JSONL run history", () => {
  it("preserves a completed run across store instances", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-studio-"));
    const path = join(directory, "runs.jsonl");
    const document = await loadWorkflowDocument("examples/spec-to-demo.wir.yaml");
    const inputs = await loadStudioInputs("examples/spec-to-demo.input.json");
    const firstStore = new JsonlStudioRunStore(path);

    let monotonicTime = 100;
    const run = await executeStudioRun({
      workflow: document.workflow,
      inputs,
      store: firstStore,
      runId: "run-persisted",
      now: () => "2026-07-14T00:00:00.000Z",
      monotonicNow: () => monotonicTime++
    });
    expect(run).toMatchObject({
      status: "completed",
      nodeStates: { "build-demo": "completed", "verify-release": "completed" }
    });
    expect(run.events.map((event) => event.elapsedMs)).toEqual([0, 2, 2, 3, 3, 4, 4, 5, 5, 7]);
    expect(run.events.map((event) => event.occurredAt)).toEqual(
      [...run.events]
        .sort((left, right) => (left.elapsedMs ?? 0) - (right.elapsedMs ?? 0))
        .map((event) => event.occurredAt)
    );
    expect(run.events.find((event) => event.type === "NodeCompleted")?.payload).toMatchObject({
      durationMs: 1
    });

    const reopenedStore = new JsonlStudioRunStore(path);
    await expect(reopenedStore.list()).resolves.toMatchObject([
      { runId: "run-persisted", status: "completed", eventCount: 10, artifactCount: 2 }
    ]);
    await expect(reopenedStore.get("run-persisted")).resolves.toMatchObject({
      traceDigest: run.traceDigest,
      outputs: run.outputs
    });
    const source = await readFile(path, "utf8");
    expect(source.endsWith("\n")).toBe(true);
    expect(source.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(source) as unknown).toMatchObject({
      schemaVersion: "awf/studio-run/v1",
      runId: "run-persisted"
    });
  });
});
