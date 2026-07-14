import { canonicalize, sha256Hex } from "@awf/ir";
import type { ArtifactSensitivity, StoredArtifactMetadata } from "@awf/lineage";
import type { StoredRunEvent } from "@awf/runtime-core";

export interface RetentionPolicy {
  defaultDays: number;
  daysBySensitivity?: Partial<Record<ArtifactSensitivity, number>>;
  protectedArtifactIds?: string[];
  legalHoldScopeTags?: string[];
}

export interface RetentionDecision {
  artifactId: string;
  action: "keep" | "delete";
  reason: "not_expired" | "explicitly_protected" | "legal_hold" | "lineage_dependency" | "expired";
}

export interface AuditExport {
  schemaVersion: "awf/audit-export/v1";
  exportId: string;
  tenantId: string;
  createdAt: string;
  redactedKeys: string[];
  events: Array<Omit<StoredRunEvent, "payload"> & { payload: unknown }>;
}

export interface TenantQuota {
  maxRuns: number;
  maxArtifacts: number;
  maxStorageBytes: number;
  maxCostUsd: number;
  maxTokens: number;
}

export interface TenantUsage {
  runs: number;
  artifacts: number;
  storageBytes: number;
  costUsd: number;
  tokens: number;
}

export interface QuotaEvaluation {
  allowed: boolean;
  violations: Array<{ resource: keyof TenantUsage; used: number; limit: number }>;
  utilization: Record<keyof TenantUsage, number>;
}

const defaultRedactedKeys = [
  "apiKey",
  "authorization",
  "cookie",
  "headers",
  "password",
  "prompt",
  "secret",
  "token",
  "toolPayload"
];

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertDays(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative day count`);
}

export function planArtifactRetention(
  artifacts: ReadonlyArray<StoredArtifactMetadata>,
  policy: RetentionPolicy,
  now: string
): RetentionDecision[] {
  assertDays(policy.defaultDays, "defaultDays");
  for (const [sensitivity, days] of Object.entries(policy.daysBySensitivity ?? {})) {
    if (days !== undefined) assertDays(days, `daysBySensitivity.${sensitivity}`);
  }
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("retention time is invalid");
  const explicit = new Set(policy.protectedArtifactIds ?? []);
  const holds = new Set(policy.legalHoldScopeTags ?? []);
  const base = new Map<string, RetentionDecision>();
  for (const artifact of artifacts) {
    const ageMs = nowMs - Date.parse(artifact.createdAt);
    if (!Number.isFinite(ageMs))
      throw new Error(`artifact time is invalid: ${artifact.artifactId}`);
    const days = policy.daysBySensitivity?.[artifact.sensitivity] ?? policy.defaultDays;
    const reason = explicit.has(artifact.artifactId)
      ? "explicitly_protected"
      : artifact.scopeTags.some((tag) => holds.has(tag))
        ? "legal_hold"
        : ageMs <= days * 86_400_000
          ? "not_expired"
          : "expired";
    base.set(artifact.artifactId, {
      artifactId: artifact.artifactId,
      action: reason === "expired" ? "delete" : "keep",
      reason
    });
  }
  const byId = new Map(artifacts.map((artifact) => [artifact.artifactId, artifact]));
  for (const artifact of artifacts) {
    for (const parent of artifact.provenance) {
      if (!byId.has(parent.inputArtifactId)) {
        throw new Error(
          `retention input is missing parent ${parent.inputArtifactId} for ${artifact.artifactId}`
        );
      }
    }
  }
  const queue = [...base.values()]
    .filter((decision) => decision.action === "keep")
    .map((decision) => decision.artifactId);
  const visited = new Set(queue);
  while (queue.length > 0) {
    const childId = queue.shift();
    if (childId === undefined) break;
    for (const parent of byId.get(childId)?.provenance ?? []) {
      if (visited.has(parent.inputArtifactId)) continue;
      visited.add(parent.inputArtifactId);
      queue.push(parent.inputArtifactId);
      const decision = base.get(parent.inputArtifactId);
      if (decision?.action === "delete") {
        base.set(parent.inputArtifactId, {
          artifactId: parent.inputArtifactId,
          action: "keep",
          reason: "lineage_dependency"
        });
      }
    }
  }
  return [...base.values()].sort((left, right) => utf16(left.artifactId, right.artifactId));
}

function redact(value: unknown, keys: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item, keys));
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).sort(([left], [right]) => utf16(left, right))) {
    result[key] = keys.has(key.toLowerCase()) ? "[REDACTED]" : redact(child, keys);
  }
  return result;
}

export function createAuditExport(input: {
  tenantId: string;
  createdAt: string;
  events: ReadonlyArray<Readonly<StoredRunEvent>>;
  redactedKeys?: string[];
}): AuditExport {
  const redactedKeys = [...new Set(input.redactedKeys ?? defaultRedactedKeys)]
    .map((key) => key.toLowerCase())
    .sort(utf16);
  const keySet = new Set(redactedKeys);
  const events = [...input.events]
    .map((event) => {
      if (event.tenantId !== input.tenantId)
        throw new Error("audit export crosses tenant boundary");
      return { ...event, payload: redact(event.payload, keySet) };
    })
    .sort((left, right) => utf16(left.runId, right.runId) || left.sequence - right.sequence);
  const content = {
    schemaVersion: "awf/audit-export/v1" as const,
    tenantId: input.tenantId,
    createdAt: input.createdAt,
    redactedKeys,
    events
  };
  return JSON.parse(
    canonicalize({ ...content, exportId: `aud_${sha256Hex(canonicalize(content))}` })
  ) as AuditExport;
}

export function evaluateTenantQuota(usage: TenantUsage, quota: TenantQuota): QuotaEvaluation {
  const mapping: Record<keyof TenantUsage, number> = {
    runs: quota.maxRuns,
    artifacts: quota.maxArtifacts,
    storageBytes: quota.maxStorageBytes,
    costUsd: quota.maxCostUsd,
    tokens: quota.maxTokens
  };
  const violations: QuotaEvaluation["violations"] = [];
  const utilization = {} as Record<keyof TenantUsage, number>;
  for (const resource of Object.keys(mapping) as Array<keyof TenantUsage>) {
    const used = usage[resource];
    const limit = mapping[resource];
    if (!Number.isFinite(used) || used < 0 || !Number.isFinite(limit) || limit < 0) {
      throw new Error(`invalid quota value for ${resource}`);
    }
    utilization[resource] =
      limit === 0 ? (used === 0 ? 0 : Number.POSITIVE_INFINITY) : used / limit;
    if (used > limit) violations.push({ resource, used, limit });
  }
  return { allowed: violations.length === 0, violations, utilization };
}
