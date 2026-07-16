import { expect, it } from "vitest";
// @ts-expect-error -- the request projection helper is an ESM JavaScript script.
import { projectSpecToDemoSource } from "./spec-to-demo-source-projection.mjs";

it("keeps only requested screens and their directly referenced definitions", () => {
  const source = {
    meta: { scenario: "scenario", stack: "stack", notes: "large notes" },
    actors: [{ id: "actor-a" }, { id: "actor-b" }],
    components: [{ name: "PanelA" }, { name: "PanelB" }],
    interactionModel: [
      { screenId: "screen-a", affordances: [] },
      { screenId: "screen-b", affordances: [] }
    ],
    screens: [
      { id: "screen-a", actors: ["actor-a"], components: ["PanelA"] },
      { id: "screen-b", actors: ["actor-b"], components: ["PanelB"] }
    ]
  };

  const projection = projectSpecToDemoSource(source, ["screen-b"], "source-digest");

  expect(projection.screens.map((screen: { id: string }) => screen.id)).toEqual(["screen-b"]);
  expect(projection.actors).toEqual([{ id: "actor-b" }]);
  expect(projection.components).toEqual([{ name: "PanelB" }]);
  expect(projection.interactionModel).toEqual([{ screenId: "screen-b", affordances: [] }]);
  expect(projection.meta).not.toHaveProperty("notes");
  expect(projection.projection.sourceByteSha256).toBe("source-digest");
});
