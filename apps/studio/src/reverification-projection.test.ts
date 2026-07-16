import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StudioRunRecord } from "./run-store.js";
import { latestDemoReverification } from "./server.js";

describe("Studio Demo reverification projection", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
  });

  it("projects the latest immutable verdict without changing the source run status", async () => {
    const root = await mkdtemp(join(tmpdir(), "aawp-reverify-"));
    directories.push(root);
    const executionDirectory = join(root, "run_deadbeef");
    const attemptDirectory = join(root, "reverifications", "reverify_latest");
    await mkdir(attemptDirectory, { recursive: true });
    await writeFile(
      join(attemptDirectory, "verdict.json"),
      JSON.stringify({
        sourceRunId: "run_deadbeef",
        sourceWorkflowVersion: "0.5.2",
        inputDigest: "input-digest",
        snapshotContentDigest: "snapshot-digest",
        attemptId: "reverify_latest",
        status: "passed",
        completedAt: "2026-07-17T00:00:00.000Z",
        durationMs: 36781,
        verifierWorkflowVersion: "0.5.3",
        verdict: { maturity: { evidenceCheckIds: ["check-a", "check-b"] } }
      })
    );
    const record = {
      runId: "run_deadbeef",
      status: "failed",
      workflowVersion: "0.5.2",
      inputDigest: "input-digest",
      demo: { contentDigest: "snapshot-digest" },
      executor: { executionDirectory }
    } as unknown as StudioRunRecord;

    await expect(latestDemoReverification(record)).resolves.toEqual({
      attemptId: "reverify_latest",
      status: "passed",
      completedAt: "2026-07-17T00:00:00.000Z",
      durationMs: 36781,
      verifierWorkflowVersion: "0.5.3",
      evidenceCheckCount: 2
    });
    expect(record.status).toBe("failed");
  });
});
