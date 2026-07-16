import { expect, it } from "vitest";
// @ts-expect-error -- the request projection helper is an ESM JavaScript script.
import { projectSpecToDemoSource } from "./spec-to-demo-source-projection.mjs";

it("keeps requested screens and their semantic execution dependency closure", () => {
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
      {
        id: "screen-b",
        actors: ["actor-b"],
        components: ["PanelB"],
        actions: [
          {
            id: "save-b",
            targetType: "command",
            targetId: "cmd-save-b",
            visibleForCapabilities: ["cap-save-b"]
          }
        ]
      }
    ],
    flows: [{ id: "flow-b", screens: ["screen-b"], commands: ["cmd-save-b"] }],
    dataBindings: [{ screenId: "screen-b", queryRefs: ["qry-b"], commandRefs: ["cmd-save-b"] }],
    apiContracts: {
      queryContracts: [{ id: "qry-b", resource: "resource-b" }, { id: "qry-a" }],
      commandContracts: [{ id: "cmd-save-b", mutates: "resource-b" }, { id: "cmd-a" }]
    },
    stateMachines: [
      {
        id: "sm-b",
        resource: "resource-b",
        transitions: [{ command: "cmd-save-b", from: "draft", to: "saved" }]
      }
    ],
    authority: {
      capabilities: [
        { id: "cap-save-b", commands: ["cmd-save-b"] },
        { id: "cap-a", commands: ["cmd-a"] }
      ],
      actorCapabilityFixture: [
        { actorId: "actor-b", capabilities: ["cap-save-b"] },
        { actorId: "actor-a", capabilities: ["cap-a"] }
      ]
    },
    acceptance: { scenarios: [{ id: "accept-b" }] }
  };

  const projection = projectSpecToDemoSource(source, ["screen-b"], "source-digest");

  expect(projection.screens.map((screen: { id: string }) => screen.id)).toEqual(["screen-b"]);
  expect(projection.actors).toEqual([{ id: "actor-b" }]);
  expect(projection.components).toEqual([{ name: "PanelB" }]);
  expect(projection.interactionModel).toEqual([{ screenId: "screen-b", affordances: [] }]);
  expect(projection.flows).toEqual([expect.objectContaining({ id: "flow-b" })]);
  expect(projection.stateMachines).toEqual([expect.objectContaining({ id: "sm-b" })]);
  expect(projection.apiContracts.commandContracts).toEqual([
    expect.objectContaining({ id: "cmd-save-b" })
  ]);
  expect(projection.dataBindings).toEqual([expect.objectContaining({ screenId: "screen-b" })]);
  expect(projection.authority.capabilities).toEqual([
    expect.objectContaining({ id: "cap-save-b" })
  ]);
  expect(projection.acceptance).toEqual({ scenarios: [{ id: "accept-b" }] });
  expect(projection.selectionContract.status).toBe("ready");
  expect(projection.meta).not.toHaveProperty("notes");
  expect(projection.projection.sourceByteSha256).toBe("source-digest");
});

it("reports an explicit S1 scope expansion instead of hiding flow screens", () => {
  const source = {
    screens: [
      {
        id: "policy-detail",
        actions: [{ id: "open-approval", targetType: "screen", targetId: "approval-detail" }]
      },
      { id: "approval-detail" },
      { id: "approval-inbox" }
    ],
    flows: [
      {
        id: "policy-approval",
        screens: ["policy-detail", "approval-inbox", "approval-detail"]
      }
    ]
  };

  const projection = projectSpecToDemoSource(source, ["policy-detail"], "source-digest");

  expect(projection.screens.map((screen: { id: string }) => screen.id)).toEqual(["policy-detail"]);
  expect(projection.selectionContract).toMatchObject({
    status: "scope-expansion-required",
    missingRequiredScreens: ["approval-detail", "approval-inbox"]
  });
  expect(projection.flows).toEqual([expect.objectContaining({ id: "policy-approval" })]);
});

it("does not expand every optional destination of a selected navigation hub", () => {
  const source = {
    screens: [
      {
        id: "work-entry",
        actions: [
          { id: "open-policy", targetType: "screen", targetId: "policy-list" },
          { id: "open-settlement", targetType: "screen", targetId: "settlement-list" }
        ]
      },
      { id: "policy-list" },
      { id: "settlement-list" }
    ],
    acceptance: {
      scenarios: [
        {
          id: "entry-role-control",
          evidenceChecks: [
            {
              id: "check-entry-role-control",
              kind: "browser",
              screenId: "work-entry",
              actionId: "select-role",
              assertions: ["visible"]
            }
          ]
        }
      ]
    }
  };

  const projection = projectSpecToDemoSource(source, ["work-entry"], "source-digest");

  expect(projection.selectionContract).toMatchObject({
    status: "ready",
    missingRequiredScreens: [],
    outOfScopeNavigationTargets: ["policy-list", "settlement-list"]
  });
});
