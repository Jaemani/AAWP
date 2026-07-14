import { describe, expect, it } from "vitest";
import {
  ArtifactContentAlreadyExistsError,
  InMemoryArtifactLineage,
  LineageTenantBoundaryError,
  type ArtifactEdgeType,
  type ArtifactMetadata
} from "./index.js";

function artifact(
  artifactId: string,
  contentCharacter: string,
  provenance: Array<{ inputArtifactId: string; edgeType: ArtifactEdgeType }> = [],
  tenantId = "tenant-a"
): ArtifactMetadata {
  return {
    artifactId,
    tenantId,
    contentHash: contentCharacter.repeat(64),
    mediaType: "application/json",
    semanticType: "artifact.test",
    schemaVersion: "1",
    producerNodeId: "node",
    producerNodeVersion: "1",
    workflowVersionId: "workflow-v1",
    runId: "run-1",
    branchId: "branch-1",
    createdAt: "2026-07-14T00:00:00Z",
    sizeBytes: 1,
    storageUri: `cas://${contentCharacter}`,
    scopeTags: [],
    sensitivity: "internal",
    provenance
  };
}

describe("artifact lineage", () => {
  it("traverses transitive ancestors and descendants", () => {
    const lineage = new InMemoryArtifactLineage();
    lineage.publish(artifact("a", "a"));
    lineage.publish(artifact("b", "b", [{ inputArtifactId: "a", edgeType: "derived" }]));
    lineage.publish(artifact("c", "c", [{ inputArtifactId: "b", edgeType: "validated" }]));

    expect(lineage.ancestors("tenant-a", "c").artifacts.map((item) => item.artifactId)).toEqual([
      "a",
      "b"
    ]);
    expect(lineage.descendants("tenant-a", "a").artifacts.map((item) => item.artifactId)).toEqual([
      "b",
      "c"
    ]);
  });

  it("records a supersedes edge from the old artifact to the new artifact", () => {
    const lineage = new InMemoryArtifactLineage();
    lineage.publish(artifact("old", "d"));
    lineage.publish(artifact("new", "e", [{ inputArtifactId: "old", edgeType: "supersedes" }]));
    expect(lineage.ancestors("tenant-a", "new").edges).toContainEqual({
      tenantId: "tenant-a",
      parentArtifactId: "old",
      childArtifactId: "new",
      edgeType: "supersedes"
    });
  });

  it("rejects cross-tenant reads and provenance edges", () => {
    const lineage = new InMemoryArtifactLineage();
    lineage.publish(artifact("private", "f", [], "tenant-a"));
    expect(() => lineage.get("tenant-b", "private")).toThrow(LineageTenantBoundaryError);
    expect(() =>
      lineage.publish(
        artifact(
          "foreign-child",
          "1",
          [{ inputArtifactId: "private", edgeType: "derived" }],
          "tenant-b"
        )
      )
    ).toThrow(LineageTenantBoundaryError);
  });

  it("stores immutable snapshots and rejects duplicate tenant content", () => {
    const lineage = new InMemoryArtifactLineage();
    const source = artifact("first", "2");
    const stored = lineage.publish(source);
    source.scopeTags.push("mutated");
    expect(stored.scopeTags).toEqual([]);
    expect(() => lineage.publish(artifact("second", "2"))).toThrow(
      ArtifactContentAlreadyExistsError
    );
  });
});
