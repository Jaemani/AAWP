import { expect, it } from "vitest";
// @ts-expect-error -- the request projection helper is an ESM JavaScript script.
import { projectSpecToDemoSource } from "./spec-to-demo-source-projection.mjs";

it("keeps requested screens and their semantic execution dependency closure", () => {
  const source = {
    meta: { scenario: "scenario", stack: "stack", notes: "large notes" },
    scope: { entryScreenId: "screen-b" },
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
    acceptance: {
      scenarios: [
        {
          id: "accept-b",
          evidenceChecks: [{ id: "check-b", screenId: "screen-b", actionId: "save-b" }]
        }
      ]
    }
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
  expect(projection.acceptance).toEqual({
    scenarios: [expect.objectContaining({ id: "accept-b" })]
  });
  expect(projection.selectionContract.status).toBe("ready");
  expect(projection.meta).not.toHaveProperty("notes");
  expect(projection.projection.sourceByteSha256).toBe("source-digest");
});

it("reports an explicit S1 scope expansion instead of hiding flow screens", () => {
  const source = {
    scope: { entryScreenId: "policy-detail" },
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
    scope: { entryScreenId: "work-entry" },
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

it("rejects deprecated role-entry screens and ambiguous legacy storyboards before generation", () => {
  const source = {
    scope: {
      entryScreenId: "admin-work-area-entry",
      deprecatedCompatibilityScreens: [{ id: "admin-work-area-entry", status: "deprecated" }]
    },
    screens: [
      { id: "admin-work-area-entry" },
      { id: "admin-policy-list" },
      { id: "admin-policy-detail" }
    ],
    acceptance: {
      scenarios: [
        {
          evidenceChecks: [
            {
              id: "check-legacy-entry",
              screenId: "admin-work-area-entry"
            }
          ]
        }
      ]
    },
    demoStoryboard: [
      { journeyId: "transport-voucher-legacy", screenId: "admin-work-area-entry" },
      { journeyId: "youth-basic-income-shared-console", screenId: "admin-policy-list" }
    ]
  };

  const projection = projectSpecToDemoSource(
    source,
    ["admin-work-area-entry", "admin-policy-list"],
    "source-digest"
  );

  expect(projection.selectionContract.status).toBe("selection-conflict");
  expect(
    projection.selectionContract.conflicts.map((conflict: { code: string }) => conflict.code)
  ).toEqual(
    expect.arrayContaining([
      "ENTRY_SCREEN_DEPRECATED",
      "DEPRECATED_SCREEN_REQUESTED",
      "ACTIVE_ACCEPTANCE_USES_DEPRECATED_SCREEN",
      "ACTIVE_STORYBOARD_USES_DEPRECATED_SCREEN",
      "ACTIVE_DEMO_JOURNEY_AMBIGUOUS"
    ])
  );
});

it("uses an explicit canonical entry and projects only the active Demo journey", () => {
  const source = {
    scope: {
      entryScreenId: "admin-policy-list",
      activeDemoJourneyId: "youth-basic-income-shared-console",
      deprecatedCompatibilityScreens: [{ id: "admin-work-area-entry", status: "deprecated" }]
    },
    screens: [{ id: "admin-policy-detail" }, { id: "admin-policy-list" }],
    demoStoryboard: [
      {
        journeyId: "transport-voucher-legacy",
        screenId: "admin-policy-detail",
        status: "deprecated"
      },
      {
        journeyId: "youth-basic-income-shared-console",
        screenId: "admin-policy-list"
      },
      {
        journeyId: "youth-basic-income-shared-console",
        screenId: "admin-policy-detail"
      }
    ]
  };

  const projection = projectSpecToDemoSource(
    source,
    ["admin-policy-detail", "admin-policy-list"],
    "source-digest"
  );

  expect(projection.selectionContract).toMatchObject({
    status: "ready",
    entryScreenId: "admin-policy-list",
    entrySource: "spec",
    activeDemoJourneyId: "youth-basic-income-shared-console"
  });
  expect(projection.demoStoryboard).toEqual([
    expect.objectContaining({
      journeyId: "youth-basic-income-shared-console",
      screenId: "admin-policy-list"
    }),
    expect.objectContaining({
      journeyId: "youth-basic-income-shared-console",
      screenId: "admin-policy-detail"
    })
  ]);
});

it("does not leak unrelated acceptance scenarios into a focused Demo projection", () => {
  const source = {
    scope: { entryScreenId: "policy-list" },
    screens: [{ id: "policy-list" }, { id: "merchant-home" }],
    acceptance: {
      owner: "release-team",
      scenarios: [
        {
          id: "policy-acceptance",
          evidenceChecks: [{ id: "check-policy", screenId: "policy-list" }]
        },
        {
          id: "merchant-acceptance",
          evidenceChecks: [{ id: "check-merchant", screenId: "merchant-home" }]
        }
      ]
    }
  };

  const projection = projectSpecToDemoSource(source, ["policy-list"], "source-digest");

  expect(projection.acceptance).toEqual({
    owner: "release-team",
    scenarios: [expect.objectContaining({ id: "policy-acceptance" })]
  });
});
