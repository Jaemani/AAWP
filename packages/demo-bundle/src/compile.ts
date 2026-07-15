import { canonicalize, digestWorkflow } from "@awf/ir";
import { parseDemoBundleManifestDraft, type DemoBundleManifestDraft } from "./schema.js";

export interface DemoBundleManifest extends DemoBundleManifestDraft {
  digest: string;
}

export class DemoBundleCompilationError extends Error {
  constructor(
    readonly code:
      | "DUPLICATE_ID"
      | "UNKNOWN_REFERENCE"
      | "SURFACE_MEMBERSHIP_MISMATCH"
      | "GROUP_MEMBERSHIP_MISMATCH"
      | "UNBUNDLED_SCREEN"
      | "DUPLICATE_ROUTE"
      | "INVALID_ARTIFACT_PATH",
    message: string
  ) {
    super(message);
    this.name = "DemoBundleCompilationError";
  }
}

function uniqueMap<T extends { id: string }>(kind: string, values: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.id)) {
      throw new DemoBundleCompilationError("DUPLICATE_ID", `duplicate ${kind} id ${value.id}`);
    }
    result.set(value.id, value);
  }
  return result;
}

function assertReferences(kind: string, owner: string, ids: string[], known: Set<string>): void {
  for (const id of ids) {
    if (!known.has(id)) {
      throw new DemoBundleCompilationError(
        "UNKNOWN_REFERENCE",
        `${kind} ${owner} references unknown id ${id}`
      );
    }
  }
}

function validArtifactPath(path: string): boolean {
  if (path.startsWith("/") || path.includes("\\") || !path.endsWith(".json")) return false;
  return !path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

export function compileDemoBundleManifest(raw: DemoBundleManifestDraft): DemoBundleManifest {
  const draft = parseDemoBundleManifestDraft(raw);
  const screens = uniqueMap("screen", draft.screens);
  const groups = uniqueMap("group", draft.groups);
  const surfaces = uniqueMap("surface", draft.surfaces);
  uniqueMap("bundle", draft.bundles);
  const screenIds = new Set(screens.keys());
  const groupIds = new Set(groups.keys());
  const surfaceIds = new Set(surfaces.keys());

  const routeOwners = new Set<string>();
  const artifactPaths = new Set<string>();
  for (const screen of draft.screens) {
    assertReferences("screen surface", screen.id, [screen.surfaceId], surfaceIds);
    assertReferences("screen group", screen.id, screen.groupIds, groupIds);
    const routeOwner = `${screen.surfaceId}\0${screen.route}`;
    if (routeOwners.has(routeOwner)) {
      throw new DemoBundleCompilationError(
        "DUPLICATE_ROUTE",
        `duplicate route ${screen.route} in surface ${screen.surfaceId}`
      );
    }
    routeOwners.add(routeOwner);
    if (!validArtifactPath(screen.artifactPath) || artifactPaths.has(screen.artifactPath)) {
      throw new DemoBundleCompilationError(
        "INVALID_ARTIFACT_PATH",
        `invalid or duplicate artifact path ${screen.artifactPath}`
      );
    }
    artifactPaths.add(screen.artifactPath);
  }

  const surfaceMembership = new Map<string, string>();
  for (const surface of draft.surfaces) {
    assertReferences("surface", surface.id, surface.screenIds, screenIds);
    for (const screenId of surface.screenIds) {
      if (surfaceMembership.has(screenId) || screens.get(screenId)?.surfaceId !== surface.id) {
        throw new DemoBundleCompilationError(
          "SURFACE_MEMBERSHIP_MISMATCH",
          `screen ${screenId} must belong to exactly its declared surface ${screens.get(screenId)?.surfaceId}`
        );
      }
      surfaceMembership.set(screenId, surface.id);
    }
  }
  for (const screen of draft.screens) {
    if (surfaceMembership.get(screen.id) !== screen.surfaceId) {
      throw new DemoBundleCompilationError(
        "SURFACE_MEMBERSHIP_MISMATCH",
        `screen ${screen.id} is missing from surface ${screen.surfaceId}`
      );
    }
  }

  for (const group of draft.groups) {
    assertReferences("group", group.id, group.screenIds, screenIds);
    for (const screenId of group.screenIds) {
      if (!screens.get(screenId)?.groupIds.includes(group.id)) {
        throw new DemoBundleCompilationError(
          "GROUP_MEMBERSHIP_MISMATCH",
          `group ${group.id} and screen ${screenId} disagree about membership`
        );
      }
    }
  }
  for (const screen of draft.screens) {
    for (const groupId of screen.groupIds) {
      if (!groups.get(groupId)?.screenIds.includes(screen.id)) {
        throw new DemoBundleCompilationError(
          "GROUP_MEMBERSHIP_MISMATCH",
          `screen ${screen.id} and group ${groupId} disagree about membership`
        );
      }
    }
  }

  const bundledScreens = new Set<string>();
  for (const bundle of draft.bundles) {
    assertReferences("bundle group", bundle.id, bundle.groupIds, groupIds);
    assertReferences("bundle screen", bundle.id, bundle.screenIds, screenIds);
    for (const screenId of bundle.screenIds) bundledScreens.add(screenId);
  }
  for (const screenId of screenIds) {
    if (!bundledScreens.has(screenId)) {
      throw new DemoBundleCompilationError(
        "UNBUNDLED_SCREEN",
        `screen ${screenId} is not included in any bundle`
      );
    }
  }

  const normalized = JSON.parse(canonicalize(draft)) as DemoBundleManifestDraft;
  return Object.freeze({ ...normalized, digest: digestWorkflow(normalized) });
}
