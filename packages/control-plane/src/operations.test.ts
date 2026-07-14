import { describe, expect, it } from "vitest";
import { InMemoryArtifactLineage } from "@awf/lineage";
import type { StoredRunEvent } from "@awf/runtime-core";
import { createAuditExport, evaluateTenantQuota, planArtifactRetention } from "./operations.js";
import { fixtureArtifact } from "./test-fixture.js";

describe("control-plane operation plans", () => {
  it("keeps an expired ancestor when a retained child depends on it", () => {
    const lineage = new InMemoryArtifactLineage();
    const parent = lineage.publish(
      fixtureArtifact({ artifactId: "old-parent", createdAt: "2025-01-01T00:00:00.000Z" })
    );
    const child = lineage.publish(
      fixtureArtifact({
        artifactId: "recent-child",
        parentArtifactId: "old-parent",
        createdAt: "2026-07-10T00:00:00.000Z"
      })
    );
    const orphan = lineage.publish(
      fixtureArtifact({ artifactId: "old-orphan", createdAt: "2025-01-01T00:00:00.000Z" })
    );

    expect(
      planArtifactRetention(
        [parent, child, orphan],
        { defaultDays: 30 },
        "2026-07-14T00:00:00.000Z"
      )
    ).toEqual([
      { artifactId: "old-orphan", action: "delete", reason: "expired" },
      { artifactId: "old-parent", action: "keep", reason: "lineage_dependency" },
      { artifactId: "recent-child", action: "keep", reason: "not_expired" }
    ]);
  });

  it("redacts sensitive payload fields before creating an audit digest", () => {
    const events: StoredRunEvent[] = [
      {
        tenantId: "tenant-a",
        runId: "run-a",
        eventKey: "tool",
        sequence: 1,
        type: "ToolInvoked",
        occurredAt: "2026-07-01T00:00:00.000Z",
        payload: {
          authorization: "Bearer raw-secret",
          nested: { token: "raw-token", operation: "list" }
        }
      }
    ];

    const audit = createAuditExport({
      tenantId: "tenant-a",
      createdAt: "2026-07-14T00:00:00.000Z",
      events
    });
    expect(audit.events[0]?.payload).toEqual({
      authorization: "[REDACTED]",
      nested: { operation: "list", token: "[REDACTED]" }
    });
    expect(audit.exportId).toMatch(/^aud_[a-f0-9]{64}$/);
  });

  it("reports every exceeded tenant quota without mutating usage", () => {
    const result = evaluateTenantQuota(
      { runs: 2, artifacts: 11, storageBytes: 50, costUsd: 3, tokens: 100 },
      { maxRuns: 3, maxArtifacts: 10, maxStorageBytes: 50, maxCostUsd: 2, maxTokens: 100 }
    );

    expect(result.allowed).toBe(false);
    expect(result.violations.map((item) => item.resource)).toEqual(["artifacts", "costUsd"]);
  });
});
