import { randomUUID } from "node:crypto";
import type {
  PreviewEnvironmentHandle,
  PreviewEnvironmentPort,
  PreviewEnvironmentRequest
} from "@awf/preview-contracts";
import { assertPreviewContractsReady } from "@awf/preview-contracts";
import { PGlite } from "@electric-sql/pglite";
import { PREVIEW_HARNESS_MIGRATION } from "./migration.js";

interface EnvironmentState {
  database: PGlite;
  handle: PreviewEnvironmentHandle;
}

export interface AppendPreviewResourceRequest {
  environmentId: string;
  entityId: string;
  resourceId: string;
  expectedVersion: number;
  payload: unknown;
  commandId: string;
  actorId: string;
}

export interface PreviewCommandResultRequest {
  environmentId: string;
  commandId: string;
  idempotencyKey: string;
  requestDigest: string;
  result: unknown;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function isExpired(handle: PreviewEnvironmentHandle, now: number): boolean {
  return Date.parse(handle.expiresAt) <= now;
}

export class PreviewEnvironmentNotFoundError extends Error {
  readonly code = "PREVIEW_ENVIRONMENT_NOT_FOUND";

  constructor(readonly environmentId: string) {
    super(`preview environment not found: ${environmentId}`);
    this.name = "PreviewEnvironmentNotFoundError";
  }
}

export class PreviewIdempotencyConflictError extends Error {
  readonly code = "PREVIEW_IDEMPOTENCY_CONFLICT";

  constructor(
    readonly commandId: string,
    readonly idempotencyKey: string
  ) {
    super(`idempotency key was reused with different input: ${commandId}/${idempotencyKey}`);
    this.name = "PreviewIdempotencyConflictError";
  }
}

export class PGlitePreviewEnvironmentPort implements PreviewEnvironmentPort {
  readonly name = "pglite-ephemeral-preview";
  readonly #environments = new Map<string, EnvironmentState>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly createDatabase: () => PGlite = () => new PGlite()
  ) {}

  async provision(request: PreviewEnvironmentRequest): Promise<PreviewEnvironmentHandle> {
    assertPreviewContractsReady(request);
    if (!Number.isSafeInteger(request.leaseMs) || request.leaseMs < 1_000) {
      throw new RangeError("preview leaseMs must be an integer of at least 1000ms");
    }
    const createdAtMs = this.now();
    const environmentId = `preview_${randomUUID()}`;
    const database = this.createDatabase();
    try {
      await database.exec(PREVIEW_HARNESS_MIGRATION);
      await database.query(
        `INSERT INTO aawp_preview.contracts (contract_kind, contract_digest, contract)
         VALUES ($1, $2, $3::jsonb), ($4, $5, $6::jsonb)`,
        [
          "data",
          request.dataContract.digest,
          json(request.dataContract),
          "api",
          request.apiContract.digest,
          json(request.apiContract)
        ]
      );
      const handle: PreviewEnvironmentHandle = {
        environmentId,
        status: "ready",
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(createdAtMs + request.leaseMs).toISOString(),
        databaseRef: { kind: "opaque-local", reference: environmentId },
        contractDigests: {
          data: request.dataContract.digest,
          api: request.apiContract.digest
        },
        networkPolicy: request.networkPolicy
      };
      this.#environments.set(environmentId, { database, handle });
      return handle;
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  async inspect(environmentId: string): Promise<PreviewEnvironmentHandle | undefined> {
    const state = this.#environments.get(environmentId);
    if (state === undefined) return undefined;
    if (isExpired(state.handle, this.now())) {
      await state.database.close();
      this.#environments.delete(environmentId);
      return { ...state.handle, status: "expired" };
    }
    return state.handle;
  }

  async destroy(environmentId: string): Promise<PreviewEnvironmentHandle | undefined> {
    const state = this.#environments.get(environmentId);
    if (state === undefined) return undefined;
    await state.database.close();
    this.#environments.delete(environmentId);
    return { ...state.handle, status: "destroyed" };
  }

  async appendResourceVersion(request: AppendPreviewResourceRequest): Promise<number> {
    const database = await this.#database(request.environmentId);
    const result = await database.query<{ version: string }>(
      `SELECT aawp_preview.append_resource_version($1, $2, $3, $4::jsonb, $5, $6)::text AS version`,
      [
        request.entityId,
        request.resourceId,
        request.expectedVersion,
        json(request.payload),
        request.commandId,
        request.actorId
      ]
    );
    const version = Number(result.rows[0]?.version);
    if (!Number.isSafeInteger(version))
      throw new Error("preview database returned invalid version");
    return version;
  }

  async recordCommandResult(request: PreviewCommandResultRequest): Promise<{
    replayed: boolean;
    result: unknown;
  }> {
    const database = await this.#database(request.environmentId);
    const existing = await database.query<{ request_digest: string; result: unknown }>(
      `SELECT request_digest, result
       FROM aawp_preview.command_results
       WHERE command_id = $1 AND idempotency_key = $2`,
      [request.commandId, request.idempotencyKey]
    );
    const row = existing.rows[0];
    if (row !== undefined) {
      if (row.request_digest !== request.requestDigest) {
        throw new PreviewIdempotencyConflictError(request.commandId, request.idempotencyKey);
      }
      return { replayed: true, result: row.result };
    }
    await database.query(
      `INSERT INTO aawp_preview.command_results (
        command_id, idempotency_key, request_digest, result
      ) VALUES ($1, $2, $3, $4::jsonb)`,
      [request.commandId, request.idempotencyKey, request.requestDigest, json(request.result)]
    );
    return { replayed: false, result: request.result };
  }

  async readLatestResource(
    environmentId: string,
    entityId: string,
    resourceId: string
  ): Promise<{ version: number; payload: unknown } | undefined> {
    const database = await this.#database(environmentId);
    const result = await database.query<{ resource_version: string; payload: unknown }>(
      `SELECT resource_version::text, payload
       FROM aawp_preview.resource_versions
       WHERE entity_id = $1 AND resource_id = $2
       ORDER BY resource_version DESC
       LIMIT 1`,
      [entityId, resourceId]
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : { version: Number(row.resource_version), payload: row.payload };
  }

  async #database(environmentId: string): Promise<PGlite> {
    const handle = await this.inspect(environmentId);
    const state = this.#environments.get(environmentId);
    if (handle?.status !== "ready" || state === undefined) {
      throw new PreviewEnvironmentNotFoundError(environmentId);
    }
    return state.database;
  }
}
