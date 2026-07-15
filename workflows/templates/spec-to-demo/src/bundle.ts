import {
  compileDemoBundleManifest,
  type DemoBundleGroup,
  type DemoBundleManifest
} from "@awf/demo-bundle";
import { digestWorkflow } from "@awf/ir";
import type { ScopeContract, SpecDocument } from "./compiler/index.js";

export function compileSpecDemoBundle(
  document: SpecDocument,
  scope: ScopeContract
): DemoBundleManifest {
  const selectedIds = new Set(scope.includedScreenIds);
  const selectedScreens = document.screens.filter((screen) => selectedIds.has(screen.id));
  const groups: DemoBundleGroup[] = (document.screenGroups ?? [])
    .filter((group) => scope.selectedGroupIds.includes(group.id))
    .map((group) => ({
      id: group.id,
      label: group.title,
      kind: group.kind,
      screenIds: group.screenIds.filter((screenId) => selectedIds.has(screenId))
    }))
    .filter((group) => group.screenIds.length > 0);
  const groupedScreenIds = new Set(groups.flatMap((group) => group.screenIds));
  const ungroupedScreenIds = selectedScreens
    .map((screen) => screen.id)
    .filter((screenId) => !groupedScreenIds.has(screenId));
  if (ungroupedScreenIds.length > 0) {
    groups.push({
      id: "explicit-selection",
      label: "선택한 화면",
      kind: "topic",
      screenIds: ungroupedScreenIds
    });
  }

  const screenToGroupIds = new Map<string, string[]>();
  for (const group of groups) {
    for (const screenId of group.screenIds) {
      screenToGroupIds.set(screenId, [...(screenToGroupIds.get(screenId) ?? []), group.id]);
    }
  }
  return compileDemoBundleManifest({
    schemaVersion: "aawp/demo-bundle/v1",
    manifestId: `${document.documentId}-${scope.digest.slice(0, 12)}`,
    title: `${document.title} demo`,
    ...(scope.requestText === undefined ? {} : { requestText: scope.requestText }),
    source: {
      artifactId: document.sourceArtifactId,
      contentDigest: digestWorkflow(document)
    },
    bundles: [
      {
        id: "requested-scope",
        title: scope.requestText ?? "선택한 화면",
        groupIds: groups.map((group) => group.id),
        screenIds: selectedScreens.map((screen) => screen.id)
      }
    ],
    surfaces: [
      {
        id: "web-demo",
        label: "Web demo",
        formFactor: "web",
        screenIds: selectedScreens.map((screen) => screen.id)
      }
    ],
    groups,
    screens: selectedScreens.map((screen) => ({
      id: screen.id,
      title: screen.title,
      route: screen.route,
      surfaceId: "web-demo",
      groupIds: screenToGroupIds.get(screen.id) ?? ["explicit-selection"],
      artifactPath: `screens/${screen.id}.json`
    }))
  });
}
