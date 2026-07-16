import type { ApiContract, DataContract, PreviewEnvironmentRequest } from "@awf/preview-contracts";
import { PreviewContractBlockedError } from "@awf/preview-contracts";
import { describe, expect, it } from "vitest";
import {
  PGlitePreviewEnvironmentPort,
  PreviewEnvironmentNotFoundError,
  PreviewIdempotencyConflictError
} from "./index.js";

function contracts(status: "ready" | "blocked" = "ready"): {
  dataContract: DataContract;
  apiContract: ApiContract;
} {
  const blockerIds = status === "blocked" ? ["finding_s2"] : [];
  const source = { artifactPath: "spec.json", byteSha256: "a".repeat(64) };
  return {
    dataContract: {
      schemaVersion: "aawp/data-contract/v1",
      source,
      targetMaturity: "S2",
      status,
      entities: [],
      queries: [],
      bindings: [],
      blockerIds,
      unsupportedPhysicalDecisions: [],
      digest: "b".repeat(64)
    },
    apiContract: {
      schemaVersion: "aawp/api-contract/v1",
      source,
      targetMaturity: "S2",
      status,
      commands: [],
      queries: [],
      unresolvedContracts: [],
      blockerIds,
      transport: { status: "unresolved", reason: "test" },
      digest: "c".repeat(64)
    }
  };
}

function request(status: "ready" | "blocked" = "ready"): PreviewEnvironmentRequest {
  return {
    tenantId: "tenant-test",
    runId: "run-test",
    ...contracts(status),
    leaseMs: 60_000,
    networkPolicy: "deny-all"
  };
}

describe("PGlite preview environment", () => {
  it("refuses to provision a Preview while an S2 contract is blocked", async () => {
    const port = new PGlitePreviewEnvironmentPort();
    await expect(port.provision(request("blocked"))).rejects.toBeInstanceOf(
      PreviewContractBlockedError
    );
  });

  it("provisions an isolated contract registry and enforces resource versions", async () => {
    const port = new PGlitePreviewEnvironmentPort();
    const handle = await port.provision(request());
    expect(handle).toMatchObject({ status: "ready", networkPolicy: "deny-all" });
    await expect(
      port.appendResourceVersion({
        environmentId: handle.environmentId,
        entityId: "ent-policy-version",
        resourceId: "policy-version-1",
        expectedVersion: 0,
        payload: { state: "draft" },
        commandId: "cmd-create-policy-version",
        actorId: "actor-1"
      })
    ).resolves.toBe(1);
    await expect(
      port.appendResourceVersion({
        environmentId: handle.environmentId,
        entityId: "ent-policy-version",
        resourceId: "policy-version-1",
        expectedVersion: 0,
        payload: { state: "approved" },
        commandId: "cmd-approve-policy",
        actorId: "actor-2"
      })
    ).rejects.toThrow("resource version conflict");
    await expect(
      port.readLatestResource(handle.environmentId, "ent-policy-version", "policy-version-1")
    ).resolves.toEqual({ version: 1, payload: { state: "draft" } });
    await port.destroy(handle.environmentId);
    await expect(
      port.readLatestResource(handle.environmentId, "ent-policy-version", "policy-version-1")
    ).rejects.toBeInstanceOf(PreviewEnvironmentNotFoundError);
  });

  it("replays equal idempotency input and rejects key reuse with different input", async () => {
    const port = new PGlitePreviewEnvironmentPort();
    const handle = await port.provision(request());
    const first = {
      environmentId: handle.environmentId,
      commandId: "cmd-submit-policy",
      idempotencyKey: "submit-1",
      requestDigest: "d".repeat(64),
      result: { approvalId: "approval-1" }
    };
    await expect(port.recordCommandResult(first)).resolves.toEqual({
      replayed: false,
      result: first.result
    });
    await expect(port.recordCommandResult(first)).resolves.toEqual({
      replayed: true,
      result: first.result
    });
    await expect(
      port.recordCommandResult({ ...first, requestDigest: "e".repeat(64) })
    ).rejects.toBeInstanceOf(PreviewIdempotencyConflictError);
    await port.destroy(handle.environmentId);
  });

  it("expires a leased environment without exposing a database path", async () => {
    let now = Date.parse("2026-07-16T00:00:00.000Z");
    const port = new PGlitePreviewEnvironmentPort(() => now);
    const handle = await port.provision({ ...request(), leaseMs: 1_000 });
    expect(handle.databaseRef.kind).toBe("opaque-local");
    now += 1_001;
    await expect(port.inspect(handle.environmentId)).resolves.toMatchObject({ status: "expired" });
    await expect(port.inspect(handle.environmentId)).resolves.toBeUndefined();
  });
});
