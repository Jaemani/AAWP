import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createHeavyProductionSpecValidator } from "./heavy-production-spec-profile.js";

const source = JSON.parse(
  await readFile(new URL("../../../../refined-production-spec.json", import.meta.url), "utf8")
) as Record<string, unknown>;

describe("heavy production spec profile", () => {
  it("accepts the pinned 102-screen source before feedback is applied", () => {
    const findings = createHeavyProductionSpecValidator(source)(source);

    expect(findings).toEqual([]);
    expect(source.screens).toHaveLength(102);
    expect(source.components).toHaveLength(140);
    expect(source.actors).toHaveLength(24);
  });

  it("detects broken references, duplicate routes, authority collapse, and removed baseline screens", () => {
    const candidate = structuredClone(source) as {
      screens: Array<Record<string, unknown>>;
      actors: Array<Record<string, unknown>>;
      navModel: { shells: Array<{ items: Array<Record<string, unknown>> }> };
    };
    candidate.screens.splice(1, 1);
    candidate.screens[1]!.route = candidate.screens[0]!.route;
    candidate.screens[0]!.components = ["UnknownComponent"];
    candidate.navModel.shells[0]!.items[0]!.target = "missing-screen";
    const admin = candidate.actors.find((actor) => actor.id === "act-superadmin")!;
    admin.separationFrom = [];

    const codes = createHeavyProductionSpecValidator(source)(candidate).map(
      (finding) => finding.code
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        "HEAVY_SPEC_DUPLICATE_SCREEN_ROUTE",
        "HEAVY_SPEC_UNKNOWN_COMPONENT_REF",
        "HEAVY_SPEC_UNKNOWN_NAV_TARGET",
        "HEAVY_SPEC_AUTHORITY_ROOTS_NOT_SEPARATED",
        "HEAVY_SPEC_BASELINE_ENTITY_REMOVED"
      ])
    );
  });
});
