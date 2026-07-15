import { describe, expect, it } from "vitest";
import {
  compileDemoBundleManifest,
  DemoBundleCompilationError,
  type DemoBundleManifestDraft
} from "./index.js";

function fixture(): DemoBundleManifestDraft {
  return {
    schemaVersion: "aawp/demo-bundle/v1",
    manifestId: "wallet-policy-bundle",
    title: "정책 묶음",
    requestText: "정책 화면을 묶어서 보여줘",
    source: { artifactId: "spec-wallet-v1", contentDigest: "a".repeat(64) },
    bundles: [
      {
        id: "policy-operations",
        title: "정책 운영",
        groupIds: ["policy"],
        screenIds: ["policy-list", "policy-mobile"]
      }
    ],
    surfaces: [
      { id: "admin-web", label: "관리 콘솔", formFactor: "web", screenIds: ["policy-list"] },
      {
        id: "consumer-mobile",
        label: "사용자 앱",
        formFactor: "mobile",
        screenIds: ["policy-mobile"]
      }
    ],
    groups: [
      {
        id: "policy",
        label: "정책",
        kind: "topic",
        screenIds: ["policy-list", "policy-mobile"]
      }
    ],
    screens: [
      {
        id: "policy-list",
        title: "정책 목록",
        route: "/admin/policies",
        surfaceId: "admin-web",
        groupIds: ["policy"],
        artifactPath: "screens/policy-list.json"
      },
      {
        id: "policy-mobile",
        title: "내 정책",
        route: "/policies",
        surfaceId: "consumer-mobile",
        groupIds: ["policy"],
        artifactPath: "screens/policy-mobile.json"
      }
    ]
  };
}

describe("demo bundle manifest compiler", () => {
  it("preserves flexible web and mobile surfaces behind one bundle contract", () => {
    const manifest = compileDemoBundleManifest(fixture());
    expect(manifest.surfaces.map((surface) => surface.formFactor)).toEqual(["web", "mobile"]);
    expect(manifest.screens).toHaveLength(2);
    expect(manifest.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(compileDemoBundleManifest(fixture())).toEqual(manifest);
  });

  it("rejects merged or dangling screen membership", () => {
    const invalid = fixture();
    invalid.surfaces[0]!.screenIds.push("policy-mobile");
    expect(() => compileDemoBundleManifest(invalid)).toThrowError(
      expect.objectContaining({ code: "SURFACE_MEMBERSHIP_MISMATCH" })
    );
  });

  it("rejects traversal paths and unbundled screens", () => {
    const invalidPath = fixture();
    invalidPath.screens[0]!.artifactPath = "../policy.json";
    expect(() => compileDemoBundleManifest(invalidPath)).toThrow(DemoBundleCompilationError);

    const unbundled = fixture();
    unbundled.bundles[0]!.screenIds = ["policy-list"];
    expect(() => compileDemoBundleManifest(unbundled)).toThrowError(
      expect.objectContaining({ code: "UNBUNDLED_SCREEN" })
    );
  });
});
