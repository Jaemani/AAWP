import { validateWorkflow } from "@awf/compiler";
import { canonicalize, sha256Hex, type WorkflowDefinition } from "@awf/ir";
import {
  InMemoryArtifactLineage,
  type ArtifactMetadata,
  type StoredArtifactMetadata
} from "@awf/lineage";
import { InMemoryRunEventStore, type StoredRunEvent } from "@awf/runtime-core";
import { verifyEvidenceBundleIntegrity, type EvidenceBundle } from "@awf/verifier-sdk";

export interface ControlPlaneBackupContent {
  schemaVersion: "awf/control-plane-backup/v1";
  tenantId: string;
  createdAt: string;
  workflows: WorkflowDefinition[];
  events: StoredRunEvent[];
  artifacts: ArtifactMetadata[];
  evidenceBundles: EvidenceBundle[];
}

export interface ControlPlaneBackup extends ControlPlaneBackupContent {
  backupId: string;
}

export interface RestoredControlPlaneState {
  backupId: string;
  tenantId: string;
  workflows: WorkflowDefinition[];
  evidenceBundles: EvidenceBundle[];
  lineage: InMemoryArtifactLineage;
  events: InMemoryRunEventStore;
}

export class BackupIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupIntegrityError";
  }
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshot<T>(value: T): T {
  return JSON.parse(canonicalize(value)) as T;
}

function contentOf(backup: ControlPlaneBackup): ControlPlaneBackupContent {
  const { backupId: _, ...content } = backup;
  return content;
}

function backupDigest(content: ControlPlaneBackupContent): string {
  return `cpb_${sha256Hex(canonicalize(content))}`;
}

function normalize(
  input: Omit<ControlPlaneBackupContent, "schemaVersion">
): ControlPlaneBackupContent {
  return snapshot({
    schemaVersion: "awf/control-plane-backup/v1" as const,
    tenantId: input.tenantId,
    createdAt: input.createdAt,
    workflows: [...input.workflows].sort((left, right) =>
      utf16(`${left.id}\0${left.version}`, `${right.id}\0${right.version}`)
    ),
    events: [...input.events].sort(
      (left, right) => utf16(left.runId, right.runId) || left.sequence - right.sequence
    ),
    artifacts: [...input.artifacts].sort((left, right) => utf16(left.artifactId, right.artifactId)),
    evidenceBundles: [...input.evidenceBundles].sort((left, right) =>
      utf16(left.bundleId, right.bundleId)
    )
  });
}

function assertTenant(tenantId: string, actual: string, label: string): void {
  if (actual !== tenantId) throw new BackupIntegrityError(`${label} crosses tenant boundary`);
}

function assertProvenanceDag(artifacts: ArtifactMetadata[]): void {
  const pending = new Map(
    artifacts.map((artifact) => [
      artifact.artifactId,
      new Set(artifact.provenance.map((edge) => edge.inputArtifactId))
    ])
  );
  const published = new Set<string>();
  while (pending.size > 0) {
    const ready = [...pending.entries()]
      .filter(([, parents]) => [...parents].every((parent) => published.has(parent)))
      .map(([artifactId]) => artifactId)
      .sort(utf16);
    if (ready.length === 0) {
      throw new BackupIntegrityError(
        `artifact provenance contains a cycle: ${[...pending.keys()].sort(utf16).join(",")}`
      );
    }
    for (const artifactId of ready) {
      pending.delete(artifactId);
      published.add(artifactId);
    }
  }
}

const forbiddenPayloadKeys = new Set([
  "apikey",
  "authorization",
  "cookie",
  "password",
  "secret",
  "token"
]);

function containsForbiddenPayloadKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenPayloadKey);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      forbiddenPayloadKeys.has(key.toLowerCase()) || containsForbiddenPayloadKey(child)
  );
}

function validateContent(content: ControlPlaneBackupContent): void {
  if (content.schemaVersion !== "awf/control-plane-backup/v1") {
    throw new BackupIntegrityError(`unsupported backup schema ${String(content.schemaVersion)}`);
  }
  if (content.tenantId.length === 0) throw new BackupIntegrityError("backup tenant is required");
  const workflowKeys = new Set<string>();
  for (const workflow of content.workflows) {
    const validation = validateWorkflow(workflow);
    if (!validation.ok) throw new BackupIntegrityError(`invalid workflow ${workflow.id}`);
    const key = `${workflow.id}\0${workflow.version}`;
    if (workflowKeys.has(key)) throw new BackupIntegrityError(`duplicate workflow ${key}`);
    workflowKeys.add(key);
  }
  const artifactIds = new Set<string>();
  for (const artifact of content.artifacts) {
    assertTenant(content.tenantId, artifact.tenantId, `artifact ${artifact.artifactId}`);
    if (artifactIds.has(artifact.artifactId)) {
      throw new BackupIntegrityError(`duplicate artifact ${artifact.artifactId}`);
    }
    artifactIds.add(artifact.artifactId);
  }
  for (const artifact of content.artifacts) {
    for (const edge of artifact.provenance) {
      if (!artifactIds.has(edge.inputArtifactId)) {
        throw new BackupIntegrityError(
          `artifact ${artifact.artifactId} references missing parent ${edge.inputArtifactId}`
        );
      }
    }
  }
  assertProvenanceDag(content.artifacts);
  const nextByRun = new Map<string, number>();
  const keysByRun = new Map<string, Set<string>>();
  for (const event of content.events) {
    assertTenant(content.tenantId, event.tenantId, `event ${event.eventKey}`);
    if (containsForbiddenPayloadKey(event.payload)) {
      throw new BackupIntegrityError(`event ${event.eventKey} contains a forbidden secret field`);
    }
    const expected = nextByRun.get(event.runId) ?? 1;
    if (event.sequence !== expected) {
      throw new BackupIntegrityError(
        `event sequence for ${event.runId} expected ${expected}, got ${event.sequence}`
      );
    }
    const keys = keysByRun.get(event.runId) ?? new Set<string>();
    if (keys.has(event.eventKey)) {
      throw new BackupIntegrityError(`duplicate event key ${event.runId}/${event.eventKey}`);
    }
    keys.add(event.eventKey);
    keysByRun.set(event.runId, keys);
    nextByRun.set(event.runId, expected + 1);
  }
  const bundleIds = new Set<string>();
  for (const bundle of content.evidenceBundles) {
    assertTenant(content.tenantId, bundle.tenantId, `evidence ${bundle.bundleId}`);
    verifyEvidenceBundleIntegrity(bundle);
    if (bundleIds.has(bundle.bundleId)) {
      throw new BackupIntegrityError(`duplicate evidence bundle ${bundle.bundleId}`);
    }
    bundleIds.add(bundle.bundleId);
    const referencedArtifacts = [
      bundle.productArtifactId,
      ...bundle.result.evidence.map((item) => item.artifactId)
    ];
    for (const artifactId of referencedArtifacts) {
      if (!artifactIds.has(artifactId)) {
        throw new BackupIntegrityError(
          `evidence ${bundle.bundleId} references missing artifact ${artifactId}`
        );
      }
    }
  }
}

export function createControlPlaneBackup(
  input: Omit<ControlPlaneBackupContent, "schemaVersion">
): ControlPlaneBackup {
  const content = normalize(input);
  validateContent(content);
  return Object.freeze(snapshot({ ...content, backupId: backupDigest(content) }));
}

export function verifyControlPlaneBackup(backup: ControlPlaneBackup): ControlPlaneBackup {
  const raw = contentOf(backup);
  validateContent(raw);
  const content = normalize(raw);
  const expected = backupDigest(content);
  if (backup.backupId !== expected) {
    throw new BackupIntegrityError(`backup digest mismatch: ${backup.backupId}`);
  }
  return Object.freeze(snapshot({ ...content, backupId: expected }));
}

function mutableArtifact(artifact: ArtifactMetadata | StoredArtifactMetadata): ArtifactMetadata {
  return snapshot({
    ...artifact,
    scopeTags: [...artifact.scopeTags],
    provenance: artifact.provenance.map((edge) => ({ ...edge }))
  });
}

export async function restoreControlPlaneBackup(
  backup: ControlPlaneBackup
): Promise<RestoredControlPlaneState> {
  const verified = verifyControlPlaneBackup(backup);
  const lineage = new InMemoryArtifactLineage();
  const pending = new Map(
    verified.artifacts.map((artifact) => [artifact.artifactId, mutableArtifact(artifact)])
  );
  const published = new Set<string>();
  while (pending.size > 0) {
    let progress = false;
    for (const [artifactId, artifact] of [...pending.entries()].sort(([left], [right]) =>
      utf16(left, right)
    )) {
      if (!artifact.provenance.every((edge) => published.has(edge.inputArtifactId))) continue;
      lineage.publish(artifact);
      pending.delete(artifactId);
      published.add(artifactId);
      progress = true;
    }
    if (!progress) {
      throw new BackupIntegrityError(
        `artifact provenance contains a cycle: ${[...pending.keys()].sort(utf16).join(",")}`
      );
    }
  }
  const events = new InMemoryRunEventStore();
  for (const event of verified.events) {
    await events.append(
      {
        tenantId: event.tenantId,
        runId: event.runId,
        eventKey: event.eventKey,
        type: event.type,
        occurredAt: event.occurredAt,
        payload: event.payload
      },
      event.sequence
    );
  }
  return {
    backupId: verified.backupId,
    tenantId: verified.tenantId,
    workflows: snapshot(verified.workflows),
    evidenceBundles: snapshot(verified.evidenceBundles),
    lineage,
    events
  };
}
