import { describe, expect, it } from "vitest";
import type { StoredRunEvent } from "@awf/runtime-core";
import {
  BackupIntegrityError,
  createControlPlaneBackup,
  restoreControlPlaneBackup,
  verifyControlPlaneBackup
} from "./backup.js";
import { fixtureArtifact, fixtureEvidence, fixtureWorkflow } from "./test-fixture.js";

const events: StoredRunEvent[] = [
  {
    tenantId: "tenant-a",
    runId: "run-a",
    eventKey: "created",
    sequence: 1,
    type: "RunCreated",
    occurredAt: "2026-07-01T00:00:00.000Z",
    payload: { mode: "CONTRACT" }
  },
  {
    tenantId: "tenant-a",
    runId: "run-a",
    eventKey: "artifact",
    sequence: 2,
    type: "ArtifactPublished",
    occurredAt: "2026-07-01T00:00:01.000Z",
    payload: { artifactId: "artifact-child" }
  }
];

describe("control-plane metadata backup", () => {
  it("restores event sequence and artifact lineage", async () => {
    const backup = createControlPlaneBackup({
      tenantId: "tenant-a",
      createdAt: "2026-07-14T00:00:00.000Z",
      workflows: [fixtureWorkflow()],
      events,
      artifacts: [
        fixtureArtifact({ artifactId: "artifact-parent" }),
        fixtureArtifact({ artifactId: "artifact-child", parentArtifactId: "artifact-parent" }),
        fixtureArtifact({ artifactId: "artifact-evidence", parentArtifactId: "artifact-child" })
      ],
      evidenceBundles: [fixtureEvidence()]
    });

    const restored = await restoreControlPlaneBackup(backup);
    expect((await restored.events.list("tenant-a", "run-a")).map((item) => item.eventKey)).toEqual([
      "created",
      "artifact"
    ]);
    expect(
      restored.lineage
        .ancestors("tenant-a", "artifact-child")
        .artifacts.map((item) => item.artifactId)
    ).toEqual(["artifact-parent"]);
  });

  it("rejects a backup whose content changed after the digest was made", () => {
    const backup = createControlPlaneBackup({
      tenantId: "tenant-a",
      createdAt: "2026-07-14T00:00:00.000Z",
      workflows: [fixtureWorkflow()],
      events,
      artifacts: [],
      evidenceBundles: []
    });

    expect(() =>
      verifyControlPlaneBackup({ ...backup, createdAt: "2026-07-15T00:00:00.000Z" })
    ).toThrow(BackupIntegrityError);
  });

  it("rejects raw secret fields instead of copying them into a backup", () => {
    expect(() =>
      createControlPlaneBackup({
        tenantId: "tenant-a",
        createdAt: "2026-07-14T00:00:00.000Z",
        workflows: [fixtureWorkflow()],
        events: [{ ...events[0]!, payload: { authorization: "Bearer raw-secret" } }],
        artifacts: [],
        evidenceBundles: []
      })
    ).toThrow(/forbidden secret field/);
  });

  it("rejects a provenance cycle before a backup is accepted", () => {
    const left = fixtureArtifact({ artifactId: "left", parentArtifactId: "right" });
    const right = fixtureArtifact({ artifactId: "right", parentArtifactId: "left" });

    expect(() =>
      createControlPlaneBackup({
        tenantId: "tenant-a",
        createdAt: "2026-07-14T00:00:00.000Z",
        workflows: [fixtureWorkflow()],
        events: [],
        artifacts: [left, right],
        evidenceBundles: []
      })
    ).toThrow(/provenance contains a cycle/);
  });
});
