export type ArtifactSensitivity = "public" | "internal" | "confidential" | "restricted";
export type ArtifactEdgeType = "read" | "derived" | "validated" | "supersedes";

export interface ArtifactProvenance {
  inputArtifactId: string;
  edgeType: ArtifactEdgeType;
}

export interface ArtifactMetadata {
  artifactId: string;
  tenantId: string;
  contentHash: string;
  mediaType: string;
  semanticType: string;
  schemaVersion: string;
  producerNodeId: string;
  producerNodeVersion: string;
  workflowVersionId: string;
  runId: string;
  branchId: string;
  createdAt: string;
  sizeBytes: number;
  storageUri: string;
  scopeTags: string[];
  sensitivity: ArtifactSensitivity;
  provenance: ArtifactProvenance[];
}

export type StoredArtifactMetadata = Readonly<
  Omit<ArtifactMetadata, "scopeTags" | "provenance">
> & {
  readonly scopeTags: ReadonlyArray<string>;
  readonly provenance: ReadonlyArray<Readonly<ArtifactProvenance>>;
};

export interface ArtifactEdge {
  tenantId: string;
  parentArtifactId: string;
  childArtifactId: string;
  edgeType: ArtifactEdgeType;
}

export interface LineageResult {
  artifacts: ReadonlyArray<StoredArtifactMetadata>;
  edges: ReadonlyArray<Readonly<ArtifactEdge>>;
}

export class ArtifactAlreadyExistsError extends Error {
  constructor(readonly artifactId: string) {
    super(`artifact already exists: ${artifactId}`);
    this.name = "ArtifactAlreadyExistsError";
  }
}

export class ArtifactContentAlreadyExistsError extends Error {
  constructor(
    readonly tenantId: string,
    readonly contentHash: string
  ) {
    super(`artifact content already exists for tenant: ${contentHash}`);
    this.name = "ArtifactContentAlreadyExistsError";
  }
}

export class ArtifactNotFoundError extends Error {
  constructor(readonly artifactId: string) {
    super(`artifact not found: ${artifactId}`);
    this.name = "ArtifactNotFoundError";
  }
}

export class LineageTenantBoundaryError extends Error {
  constructor(readonly artifactId: string) {
    super(`artifact belongs to another tenant: ${artifactId}`);
    this.name = "LineageTenantBoundaryError";
  }
}

function utf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function contentKey(tenantId: string, contentHash: string): string {
  return `${tenantId}\0${contentHash}`;
}

function snapshotMetadata(metadata: ArtifactMetadata): StoredArtifactMetadata {
  const provenance = metadata.provenance
    .map((edge) => Object.freeze({ ...edge }))
    .sort((left, right) =>
      utf16(
        `${left.inputArtifactId}\0${left.edgeType}`,
        `${right.inputArtifactId}\0${right.edgeType}`
      )
    );
  return Object.freeze({
    ...metadata,
    scopeTags: Object.freeze([...metadata.scopeTags].sort(utf16)),
    provenance: Object.freeze(provenance)
  });
}

export class InMemoryArtifactLineage {
  private readonly artifacts = new Map<string, StoredArtifactMetadata>();
  private readonly artifactByContent = new Map<string, string>();
  private readonly edges: Array<Readonly<ArtifactEdge>> = [];

  publish(metadata: ArtifactMetadata): StoredArtifactMetadata {
    if (this.artifacts.has(metadata.artifactId))
      throw new ArtifactAlreadyExistsError(metadata.artifactId);
    if (this.artifactByContent.has(contentKey(metadata.tenantId, metadata.contentHash))) {
      throw new ArtifactContentAlreadyExistsError(metadata.tenantId, metadata.contentHash);
    }
    for (const provenance of metadata.provenance) {
      const parent = this.artifacts.get(provenance.inputArtifactId);
      if (parent === undefined) throw new ArtifactNotFoundError(provenance.inputArtifactId);
      if (parent.tenantId !== metadata.tenantId)
        throw new LineageTenantBoundaryError(provenance.inputArtifactId);
    }

    const stored = snapshotMetadata(metadata);
    this.artifacts.set(stored.artifactId, stored);
    this.artifactByContent.set(contentKey(stored.tenantId, stored.contentHash), stored.artifactId);
    for (const provenance of stored.provenance) {
      this.edges.push(
        Object.freeze({
          tenantId: stored.tenantId,
          parentArtifactId: provenance.inputArtifactId,
          childArtifactId: stored.artifactId,
          edgeType: provenance.edgeType
        })
      );
    }
    return stored;
  }

  get(tenantId: string, artifactId: string): StoredArtifactMetadata | undefined {
    const artifact = this.artifacts.get(artifactId);
    if (artifact !== undefined && artifact.tenantId !== tenantId)
      throw new LineageTenantBoundaryError(artifactId);
    return artifact;
  }

  ancestors(tenantId: string, artifactId: string): LineageResult {
    return this.traverse(tenantId, artifactId, "ancestors");
  }

  descendants(tenantId: string, artifactId: string): LineageResult {
    return this.traverse(tenantId, artifactId, "descendants");
  }

  private traverse(
    tenantId: string,
    artifactId: string,
    direction: "ancestors" | "descendants"
  ): LineageResult {
    const root = this.get(tenantId, artifactId);
    if (root === undefined) throw new ArtifactNotFoundError(artifactId);
    const visited = new Set<string>([artifactId]);
    const queue = [artifactId];
    const selectedEdges: Array<Readonly<ArtifactEdge>> = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      const adjacent = this.edges
        .filter((edge) =>
          direction === "ancestors"
            ? edge.childArtifactId === current
            : edge.parentArtifactId === current
        )
        .sort((left, right) =>
          utf16(
            `${left.parentArtifactId}\0${left.childArtifactId}\0${left.edgeType}`,
            `${right.parentArtifactId}\0${right.childArtifactId}\0${right.edgeType}`
          )
        );
      for (const edge of adjacent) {
        if (!selectedEdges.includes(edge)) selectedEdges.push(edge);
        const next = direction === "ancestors" ? edge.parentArtifactId : edge.childArtifactId;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    visited.delete(artifactId);
    const artifacts = [...visited]
      .sort(utf16)
      .map((id) => this.artifacts.get(id))
      .filter((item): item is StoredArtifactMetadata => item !== undefined);
    return { artifacts, edges: selectedEdges };
  }
}
