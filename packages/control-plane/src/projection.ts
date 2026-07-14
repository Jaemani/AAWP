import type { StoredArtifactMetadata, ArtifactEdge } from "@awf/lineage";
import type { StoredRunEvent, RunEventType } from "@awf/runtime-core";
import type { EvidenceBundle, Finding, GateResult, EvidenceItem } from "@awf/verifier-sdk";

export type RunStatus = "created" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface TimelineItem {
  sequence: number;
  type: RunEventType;
  occurredAt: string;
  label: string;
  nodeId?: string;
}

export interface ApprovalInboxItem {
  approvalId: string;
  nodeId?: string;
  requestedAt: string;
  prompt?: string;
  status: "pending" | "approved" | "rejected";
  resolvedAt?: string;
}

export interface OperatorCommandIntent {
  command: "pause" | "resume" | "cancel" | "resolve_approval";
  runId: string;
  approvalId?: string;
  requiresRole: "operator";
}

export interface RunControlProjection {
  tenantId: string;
  runId: string;
  status: RunStatus;
  timeline: TimelineItem[];
  approvals: ApprovalInboxItem[];
  budget: {
    costUsd: number;
    tokens: number;
    maxCostUsd?: number;
    maxTokens?: number;
  };
  routing?: {
    mode?: string;
    checkpoint?: string;
    workflowGain?: number;
    policyVersion?: string;
  };
  referencedSecretIds: string[];
  artifactIds: string[];
  availableCommands: OperatorCommandIntent[];
}

export interface ArtifactLineageProjection {
  artifacts: Array<
    Pick<
      StoredArtifactMetadata,
      | "artifactId"
      | "contentHash"
      | "mediaType"
      | "semanticType"
      | "schemaVersion"
      | "producerNodeId"
      | "runId"
      | "branchId"
      | "createdAt"
      | "sensitivity"
    >
  >;
  edges: Array<Pick<ArtifactEdge, "parentArtifactId" | "childArtifactId" | "edgeType">>;
}

export interface EvidenceProjection {
  bundleId: string;
  verifierId: string;
  visibility: "public" | "hidden";
  outcome: EvidenceBundle["result"]["outcome"];
  redacted: boolean;
  findings?: Finding[];
  gates?: GateResult[];
  evidence?: EvidenceItem[];
  policyDigest?: string;
  image?: string;
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function eventLabel(type: RunEventType, payload: Record<string, unknown>): string {
  const nodeId = stringValue(payload.nodeId);
  const verifierId = stringValue(payload.verifierId);
  const suffix = nodeId ?? verifierId;
  return suffix === undefined ? type : `${type}: ${suffix}`;
}

function nextStatus(status: RunStatus, event: RunEventType): RunStatus {
  if (event === "RunPaused") return "paused";
  if (event === "RunCompleted") return "completed";
  if (event === "RunFailed") return "failed";
  if (event === "RunCancelled") return "cancelled";
  if (
    status === "created" &&
    event !== "WorkflowCompiled" &&
    event !== "WorkflowPublished" &&
    event !== "RoutingDecided" &&
    event !== "RunCreated"
  ) {
    return "running";
  }
  if (
    status === "paused" &&
    [
      "NodeScheduled",
      "NodeStarted",
      "ToolInvoked",
      "ModelInvoked",
      "SideEffectPrepared",
      "SideEffectCommitted",
      "VerifierStarted"
    ].includes(event)
  )
    return "running";
  return status;
}

export function projectRunControl(
  events: ReadonlyArray<Readonly<StoredRunEvent>>
): RunControlProjection {
  if (events.length === 0) throw new Error("run projection requires at least one event");
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const tenantId = ordered[0]!.tenantId;
  const runId = ordered[0]!.runId;
  let status: RunStatus = "created";
  let costUsd = 0;
  let tokens = 0;
  let maxCostUsd: number | undefined;
  let maxTokens: number | undefined;
  let routing: RunControlProjection["routing"];
  const approvals = new Map<string, ApprovalInboxItem>();
  const secretIds = new Set<string>();
  const artifactIds = new Set<string>();
  const timeline: TimelineItem[] = [];
  for (const [index, event] of ordered.entries()) {
    if (event.tenantId !== tenantId || event.runId !== runId) {
      throw new Error("run projection cannot cross tenant or run boundaries");
    }
    if (event.sequence !== index + 1)
      throw new Error(`run event sequence gap at ${event.sequence}`);
    const payload = record(event.payload);
    const nodeId = stringValue(payload.nodeId);
    timeline.push({
      sequence: event.sequence,
      type: event.type,
      occurredAt: event.occurredAt,
      label: eventLabel(event.type, payload),
      ...(nodeId === undefined ? {} : { nodeId })
    });
    status = nextStatus(status, event.type);
    costUsd += numberValue(payload.costUsd) ?? 0;
    tokens += numberValue(payload.tokens) ?? 0;
    for (const secretId of [...strings(payload.secretRefIds), ...strings(payload.secretRefs)]) {
      secretIds.add(secretId);
    }
    const artifactId = stringValue(payload.artifactId);
    if (artifactId !== undefined) artifactIds.add(artifactId);
    if (event.type === "RunCreated") {
      const budget = record(payload.budget);
      maxCostUsd = numberValue(budget.maxCostUsd);
      maxTokens = numberValue(budget.maxTokens);
    }
    if (event.type === "RoutingDecided") {
      const mode = stringValue(payload.mode);
      const checkpoint = stringValue(payload.checkpoint);
      const workflowGain = numberValue(payload.workflowGain);
      const policyVersion = stringValue(payload.policyVersion);
      routing = {
        ...(mode === undefined ? {} : { mode }),
        ...(checkpoint === undefined ? {} : { checkpoint }),
        ...(workflowGain === undefined ? {} : { workflowGain }),
        ...(policyVersion === undefined ? {} : { policyVersion })
      };
    }
    if (event.type === "ApprovalRequested") {
      const approvalId = stringValue(payload.approvalId);
      if (approvalId !== undefined) {
        const prompt = stringValue(payload.prompt);
        approvals.set(approvalId, {
          approvalId,
          ...(nodeId === undefined ? {} : { nodeId }),
          requestedAt: event.occurredAt,
          ...(prompt === undefined ? {} : { prompt }),
          status: "pending"
        });
      }
    }
    if (event.type === "ApprovalResolved") {
      const approvalId = stringValue(payload.approvalId);
      const prior = approvalId === undefined ? undefined : approvals.get(approvalId);
      if (approvalId !== undefined && prior !== undefined) {
        const decision = stringValue(payload.decision);
        approvals.set(approvalId, {
          ...prior,
          status: decision === "approved" ? "approved" : "rejected",
          resolvedAt: event.occurredAt
        });
      }
    }
  }
  const terminal = status === "completed" || status === "failed" || status === "cancelled";
  const availableCommands: OperatorCommandIntent[] = [];
  if (!terminal) {
    availableCommands.push({
      command: status === "paused" ? "resume" : "pause",
      runId,
      requiresRole: "operator"
    });
    availableCommands.push({ command: "cancel", runId, requiresRole: "operator" });
    for (const item of approvals.values()) {
      if (item.status === "pending") {
        availableCommands.push({
          command: "resolve_approval",
          runId,
          approvalId: item.approvalId,
          requiresRole: "operator"
        });
      }
    }
  }
  return {
    tenantId,
    runId,
    status,
    timeline,
    approvals: [...approvals.values()].sort((left, right) =>
      utf16(left.approvalId, right.approvalId)
    ),
    budget: {
      costUsd,
      tokens,
      ...(maxCostUsd === undefined ? {} : { maxCostUsd }),
      ...(maxTokens === undefined ? {} : { maxTokens })
    },
    ...(routing === undefined ? {} : { routing }),
    referencedSecretIds: [...secretIds].sort(utf16),
    artifactIds: [...artifactIds].sort(utf16),
    availableCommands
  };
}

export function projectArtifactLineage(input: {
  artifacts: ReadonlyArray<StoredArtifactMetadata>;
  edges: ReadonlyArray<Readonly<ArtifactEdge>>;
}): ArtifactLineageProjection {
  return {
    artifacts: input.artifacts
      .map((artifact) => ({
        artifactId: artifact.artifactId,
        contentHash: artifact.contentHash,
        mediaType: artifact.mediaType,
        semanticType: artifact.semanticType,
        schemaVersion: artifact.schemaVersion,
        producerNodeId: artifact.producerNodeId,
        runId: artifact.runId,
        branchId: artifact.branchId,
        createdAt: artifact.createdAt,
        sensitivity: artifact.sensitivity
      }))
      .sort((left, right) => utf16(left.artifactId, right.artifactId)),
    edges: input.edges
      .map((edge) => ({
        parentArtifactId: edge.parentArtifactId,
        childArtifactId: edge.childArtifactId,
        edgeType: edge.edgeType
      }))
      .sort((left, right) =>
        utf16(
          `${left.parentArtifactId}\0${left.childArtifactId}\0${left.edgeType}`,
          `${right.parentArtifactId}\0${right.childArtifactId}\0${right.edgeType}`
        )
      )
  };
}

export function projectEvidence(
  bundles: ReadonlyArray<EvidenceBundle>,
  access: { canViewHiddenVerifier: boolean }
): EvidenceProjection[] {
  return [...bundles]
    .sort((left, right) => utf16(left.bundleId, right.bundleId))
    .map((bundle): EvidenceProjection => {
      const redacted = bundle.verifier.visibility === "hidden" && !access.canViewHiddenVerifier;
      const base = {
        bundleId: bundle.bundleId,
        verifierId: bundle.verifier.id,
        visibility: bundle.verifier.visibility,
        outcome: bundle.result.outcome,
        redacted
      };
      return redacted
        ? base
        : {
            ...base,
            findings: bundle.result.findings.map((item) => ({ ...item })),
            gates: bundle.result.gates.map((item) => ({ ...item })),
            evidence: bundle.result.evidence.map((item) => ({ ...item })),
            policyDigest: bundle.verifier.policyDigest,
            image: bundle.verifier.image
          };
    });
}
