import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("M2 PostgreSQL migration", () => {
  it("contains immutable, event ordering, tenant, and branch CAS constraints", async () => {
    const sql = await readFile(
      "packages/artifact-store/migrations/0001_m2_artifact_event_lineage.sql",
      "utf8"
    );
    expect(sql).toContain("CREATE TRIGGER events_append_only");
    expect(sql).toContain("PRIMARY KEY (tenant_id, run_id, sequence)");
    expect(sql).toContain("UNIQUE (tenant_id, run_id, event_key)");
    expect(sql).toContain("CREATE FUNCTION awf_append_event");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("REFERENCES artifacts (tenant_id, artifact_id)");
    expect(sql).toContain("CREATE FUNCTION awf_promote_branch");
    expect(sql).toContain("branch_generation = p_expected_generation");
  });

  it("executes on PostgreSQL and enforces append-only, CAS, and tenant boundaries", async () => {
    const sql = await readFile(
      "packages/artifact-store/migrations/0001_m2_artifact_event_lineage.sql",
      "utf8"
    );
    const database = new PGlite();
    try {
      await database.exec(sql);
      await database.exec(`
        INSERT INTO tenants (tenant_id, name)
        VALUES ('00000000-0000-0000-0000-000000000001', 'tenant-a');
        INSERT INTO workflow_versions (
          workflow_version_id, tenant_id, workflow_id, version, wir_digest, wir
        ) VALUES (
          '10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001',
          'workflow', '1', '${"a".repeat(64)}', '{}'
        );
        INSERT INTO runs (run_id, tenant_id, workflow_version_id)
        VALUES (
          '20000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001',
          '10000000-0000-0000-0000-000000000001'
        );
        INSERT INTO run_branches (branch_id, tenant_id, run_id)
        VALUES (
          '30000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001'
        );
      `);

      await database.query("SELECT awf_promote_branch($1, $2, $3, $4)", [
        "00000000-0000-0000-0000-000000000001",
        "20000000-0000-0000-0000-000000000001",
        "30000000-0000-0000-0000-000000000001",
        0
      ]);
      const generation = await database.query<{ branch_generation: string }>(
        "SELECT branch_generation::text FROM runs WHERE run_id = $1",
        ["20000000-0000-0000-0000-000000000001"]
      );
      expect(generation.rows[0]?.branch_generation).toBe("1");
      await expect(
        database.query("SELECT awf_promote_branch($1, $2, $3, $4)", [
          "00000000-0000-0000-0000-000000000001",
          "20000000-0000-0000-0000-000000000001",
          "30000000-0000-0000-0000-000000000001",
          0
        ])
      ).rejects.toThrow();

      await database.query("SELECT awf_append_event($1, $2, $3, $4, now(), $5, $6)", [
        "00000000-0000-0000-0000-000000000001",
        "20000000-0000-0000-0000-000000000001",
        "event-1",
        "RunCreated",
        {},
        1
      ]);
      await expect(
        database.query("SELECT awf_append_event($1, $2, $3, $4, now(), $5, $6)", [
          "00000000-0000-0000-0000-000000000001",
          "20000000-0000-0000-0000-000000000001",
          "event-2",
          "NodeStarted",
          {},
          1
        ])
      ).rejects.toThrow();
      await expect(
        database.query("SELECT awf_append_event($1, $2, $3, $4, now(), $5, $6)", [
          "00000000-0000-0000-0000-000000000001",
          "20000000-0000-0000-0000-000000000001",
          "event-1",
          "NodeStarted",
          {},
          2
        ])
      ).rejects.toThrow();
      await expect(
        database.exec("UPDATE events SET event_type = 'RunCompleted' WHERE event_key = 'event-1'")
      ).rejects.toThrow("immutable");

      await database.exec(`
        INSERT INTO artifacts (
          artifact_id, tenant_id, content_hash, media_type, semantic_type, schema_version,
          producer_node_id, producer_node_version, workflow_version_id, run_id, branch_id,
          size_bytes, storage_uri, sensitivity, created_at
        ) VALUES (
          '40000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001',
          '${"b".repeat(64)}', 'application/json', 'test', '1', 'node', '1',
          '10000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          1, 'cas://object', 'internal', now()
        );
        INSERT INTO tenants (tenant_id, name)
        VALUES ('00000000-0000-0000-0000-000000000002', 'tenant-b');
      `);
      await expect(
        database.exec(`
          INSERT INTO cache_entries (
            tenant_id, fingerprint, verifier_policy_digest, sensitivity, artifact_id
          ) VALUES (
            '00000000-0000-0000-0000-000000000002',
            '${"c".repeat(64)}', '${"d".repeat(64)}', 'internal',
            '40000000-0000-0000-0000-000000000001'
          );
        `)
      ).rejects.toThrow();
    } finally {
      await database.close();
    }
  });
});
