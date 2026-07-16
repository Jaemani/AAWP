function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function records(value) {
  return Array.isArray(value) ? value.filter((item) => Object.keys(record(item)).length > 0) : [];
}

function strings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.length > 0)
    : [];
}

function idOf(value) {
  const item = record(value);
  for (const key of ["id", "screenId", "flowId", "commandId", "queryId"]) {
    if (typeof item[key] === "string" && item[key].length > 0) return item[key];
  }
  return undefined;
}

function intersects(left, right) {
  return left.some((item) => right.has(item));
}

function apiLists(source) {
  const api = record(source.apiContracts);
  return {
    api,
    queries:
      records(api.queryContracts).length > 0 ? records(api.queryContracts) : records(api.queries),
    commands:
      records(api.commandContracts).length > 0
        ? records(api.commandContracts)
        : records(api.commands)
  };
}

export function compileSpecToDemoSelection(source, requestedScreens, explicitEntryScreenId) {
  if (!Array.isArray(source?.screens)) throw new Error("source spec must contain screens[]");
  const requested = [...new Set(requestedScreens)];
  const requestedSet = new Set(requested);
  const allScreens = records(source.screens);
  const byScreenId = new Map(allScreens.map((screen) => [screen.id, screen]));
  const scope = record(source.scope);
  const deprecatedCompatibilityScreens = records(scope.deprecatedCompatibilityScreens);
  const deprecatedScreenIds = new Set(
    deprecatedCompatibilityScreens
      .filter((screen) => screen.status === undefined || screen.status === "deprecated")
      .map((screen) => screen.id)
      .filter((id) => typeof id === "string" && id.length > 0)
  );
  const sourceEntryScreenId =
    typeof scope.entryScreenId === "string" && scope.entryScreenId.length > 0
      ? scope.entryScreenId
      : undefined;
  const entryScreenId =
    typeof explicitEntryScreenId === "string" && explicitEntryScreenId.length > 0
      ? explicitEntryScreenId
      : sourceEntryScreenId;
  const activeDemoJourneyId =
    typeof scope.activeDemoJourneyId === "string" && scope.activeDemoJourneyId.length > 0
      ? scope.activeDemoJourneyId
      : undefined;
  const conflicts = [];
  if (entryScreenId === undefined) {
    conflicts.push({
      code: "ENTRY_SCREEN_NOT_EXPLICIT",
      message: "Demo entry screen must be declared by the launcher or scope.entryScreenId."
    });
  } else if (!byScreenId.has(entryScreenId)) {
    conflicts.push({
      code: "ENTRY_SCREEN_UNKNOWN",
      screenId: entryScreenId,
      message: `Demo entry screen does not exist: ${entryScreenId}`
    });
  } else if (!requestedSet.has(entryScreenId)) {
    conflicts.push({
      code: "ENTRY_SCREEN_OUTSIDE_SELECTION",
      screenId: entryScreenId,
      message: `Demo entry screen is outside the requested screen set: ${entryScreenId}`
    });
  } else if (deprecatedScreenIds.has(entryScreenId)) {
    conflicts.push({
      code: "ENTRY_SCREEN_DEPRECATED",
      screenId: entryScreenId,
      message: `Demo entry screen is deprecated: ${entryScreenId}`
    });
  }
  for (const screenId of requested) {
    if (!deprecatedScreenIds.has(screenId)) continue;
    conflicts.push({
      code: "DEPRECATED_SCREEN_REQUESTED",
      screenId,
      message: `Requested Demo screen is deprecated by canonical scope: ${screenId}`
    });
  }
  const selected = requested.map((screenId) => {
    const screen = byScreenId.get(screenId);
    if (screen === undefined) throw new Error(`source spec has no requested screen: ${screenId}`);
    return screen;
  });

  const requiredScreenTargets = new Set();
  const optionalScreenTargets = new Set();
  const explicitFlowIds = new Set();
  const commandIds = new Set();
  const queryIds = new Set();
  const evidenceCheckIds = new Set();
  for (const screen of selected) {
    for (const action of records(screen.actions)) {
      const targetType = action.targetType ?? action.targetKind;
      if (targetType === "screen" && typeof action.targetId === "string")
        optionalScreenTargets.add(action.targetId);
      if (targetType === "flow" && typeof action.targetId === "string")
        explicitFlowIds.add(action.targetId);
      if (targetType === "command" && typeof action.targetId === "string")
        commandIds.add(action.targetId);
      if (targetType === "query" && typeof action.targetId === "string")
        queryIds.add(action.targetId);
    }
  }

  const interactions = records(source.interactionModel).filter((interaction) =>
    requestedSet.has(String(interaction.screenId))
  );
  for (const interaction of interactions) {
    for (const affordance of records(interaction.affordances)) {
      if (affordance.action === "navigate" && typeof affordance.target === "string")
        optionalScreenTargets.add(affordance.target);
      if (affordance.action === "startFlow" && typeof affordance.target === "string")
        explicitFlowIds.add(affordance.target);
      if (affordance.action === "submitCommand" && typeof affordance.target === "string")
        commandIds.add(affordance.target);
    }
  }

  const dataBindings = records(source.dataBindings).filter((binding) =>
    requestedSet.has(String(binding.screenId))
  );
  const acceptance = source.acceptance;
  const acceptanceScenarios = Array.isArray(acceptance)
    ? records(acceptance)
    : records(record(acceptance).scenarios);
  for (const scenario of acceptanceScenarios) {
    for (const check of records(scenario.evidenceChecks)) {
      if (typeof check.screenId !== "string" || !deprecatedScreenIds.has(check.screenId))
        continue;
      conflicts.push({
        code: "ACTIVE_ACCEPTANCE_USES_DEPRECATED_SCREEN",
        screenId: check.screenId,
        evidenceCheckId: typeof check.id === "string" ? check.id : undefined,
        message: `Active acceptance uses a deprecated screen: ${check.screenId}`
      });
    }
  }
  for (const scenario of acceptanceScenarios) {
    const checks = records(scenario.evidenceChecks);
    if (!checks.some((check) => requestedSet.has(String(check.screenId)))) continue;
    for (const check of checks) {
      if (typeof check.screenId === "string") requiredScreenTargets.add(check.screenId);
      if (typeof check.id === "string") evidenceCheckIds.add(check.id);
      if (typeof check.actionId === "string") {
        for (const screen of selected) {
          const action = records(screen.actions).find(
            (candidate) => candidate.id === check.actionId
          );
          if (action && (action.targetType ?? action.targetKind) === "command")
            commandIds.add(action.targetId);
        }
      }
    }
  }
  for (const binding of dataBindings) {
    strings(binding.commandRefs).forEach((id) => commandIds.add(id));
    strings(binding.queryRefs).forEach((id) => queryIds.add(id));
    if (typeof binding.commandId === "string") commandIds.add(binding.commandId);
    if (typeof binding.queryId === "string") queryIds.add(binding.queryId);
  }

  const flows = records(source.flows).filter((flow) => {
    const flowId = idOf(flow);
    return (
      (flowId !== undefined && explicitFlowIds.has(flowId)) ||
      intersects(strings(flow.screens), requestedSet)
    );
  });
  for (const flow of flows) {
    strings(flow.commands).forEach((id) => commandIds.add(id));
    strings(flow.queries).forEach((id) => queryIds.add(id));
  }

  const requiredScreenIds = [
    ...new Set([...requiredScreenTargets, ...flows.flatMap((flow) => strings(flow.screens))])
  ]
    .filter((screenId) => byScreenId.has(screenId))
    .sort();
  const missingRequiredScreens = requiredScreenIds.filter(
    (screenId) => !requestedSet.has(screenId)
  );
  const unknownScreenTargets = [...new Set([...requiredScreenTargets, ...optionalScreenTargets])]
    .filter((screenId) => !byScreenId.has(screenId))
    .sort();
  const outOfScopeNavigationTargets = [...optionalScreenTargets]
    .filter((screenId) => byScreenId.has(screenId) && !requestedSet.has(screenId))
    .sort();
  const activeStoryboards = records(source.demoStoryboard).filter(
    (storyboard) => storyboard.status !== "deprecated"
  );
  const activeJourneyIds = [
    ...new Set(
      activeStoryboards
        .map((storyboard) => storyboard.journeyId)
        .filter((id) => typeof id === "string" && id.length > 0)
    )
  ];
  for (const storyboard of activeStoryboards) {
    if (
      typeof storyboard.screenId === "string" &&
      deprecatedScreenIds.has(storyboard.screenId)
    ) {
      conflicts.push({
        code: "ACTIVE_STORYBOARD_USES_DEPRECATED_SCREEN",
        screenId: storyboard.screenId,
        journeyId:
          typeof storyboard.journeyId === "string" ? storyboard.journeyId : undefined,
        message: `Active Demo storyboard uses a deprecated screen: ${storyboard.screenId}`
      });
    }
  }
  if (activeDemoJourneyId === undefined && activeJourneyIds.length > 1) {
    conflicts.push({
      code: "ACTIVE_DEMO_JOURNEY_AMBIGUOUS",
      journeyIds: activeJourneyIds.sort(),
      message: "Multiple active Demo journeys exist without scope.activeDemoJourneyId."
    });
  } else if (
    activeDemoJourneyId !== undefined &&
    !activeJourneyIds.includes(activeDemoJourneyId)
  ) {
    conflicts.push({
      code: "ACTIVE_DEMO_JOURNEY_UNKNOWN",
      journeyId: activeDemoJourneyId,
      message: `scope.activeDemoJourneyId has no active storyboard: ${activeDemoJourneyId}`
    });
  }
  const status =
    conflicts.length > 0
      ? "selection-conflict"
      : missingRequiredScreens.length === 0 && unknownScreenTargets.length === 0
        ? "ready"
        : "scope-expansion-required";

  const contract = {
    schemaVersion: "aawp/demo-selection-contract/v2",
    status,
    entryScreenId,
    entrySource:
      explicitEntryScreenId !== undefined
        ? "launcher"
        : sourceEntryScreenId !== undefined
          ? "spec"
          : "missing",
    activeDemoJourneyId,
    requestedScreens: requested,
    deprecatedScreenIds: [...deprecatedScreenIds].sort(),
    conflicts,
    requiredScreenIds,
    missingRequiredScreens,
    unknownScreenTargets,
    outOfScopeNavigationTargets,
    flowIds: flows
      .map(idOf)
      .filter((id) => id !== undefined)
      .sort(),
    commandIds: [...commandIds].sort(),
    queryIds: [...queryIds].sort(),
    evidenceCheckIds: [...evidenceCheckIds].sort(),
    reason:
      status === "ready"
        ? "Every screen required by selected S1 flows and evidence checks is in scope."
        : status === "selection-conflict"
          ? "Canonical scope and the active Demo compatibility projection conflict."
        : "S1 cannot pass until every flow or evidence screen dependency is explicitly selected."
  };
  return JSON.parse(JSON.stringify(contract));
}

export function projectSpecToDemoSource(
  source,
  requestedScreens,
  sourceByteSha256,
  explicitEntryScreenId
) {
  const selectionContract = compileSpecToDemoSelection(
    source,
    requestedScreens,
    explicitEntryScreenId
  );
  const requestedSet = new Set(selectionContract.requestedScreens);
  const byScreenId = new Map(records(source.screens).map((screen) => [screen.id, screen]));
  const screens = selectionContract.requestedScreens.map((screenId) => byScreenId.get(screenId));
  const actorIds = new Set(screens.flatMap((screen) => strings(screen.actors)));
  const componentNames = new Set(screens.flatMap((screen) => strings(screen.components)));
  const interactions = records(source.interactionModel).filter((interaction) =>
    requestedSet.has(String(interaction.screenId))
  );
  const flowIds = new Set(selectionContract.flowIds);
  const commandIds = new Set(selectionContract.commandIds);
  const queryIds = new Set(selectionContract.queryIds);
  const flows = records(source.flows).filter((flow) => flowIds.has(String(idOf(flow))));
  const dataBindings = records(source.dataBindings).filter((binding) =>
    requestedSet.has(String(binding.screenId))
  );
  const { api, queries, commands } = apiLists(source);
  const selectedQueries = queries.filter((query) => queryIds.has(String(idOf(query))));
  const selectedCommands = commands.filter((command) => commandIds.has(String(idOf(command))));
  const resources = new Set(
    [...selectedQueries, ...selectedCommands]
      .flatMap((item) => [item.resource, item.mutates])
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .filter((item) => typeof item === "string")
  );
  const stateMachines = records(source.stateMachines).filter(
    (machine) =>
      records(machine.transitions).some((transition) =>
        commandIds.has(String(transition.command ?? transition.commandId))
      ) || resources.has(machine.resource)
  );

  const authority = record(source.authority);
  const requiredCapabilityIds = new Set(
    screens.flatMap((screen) =>
      records(screen.actions).flatMap((action) => strings(action.visibleForCapabilities))
    )
  );
  const capabilities = records(authority.capabilities).filter((capability) => {
    const matches =
      intersects(strings(capability.commands), commandIds) ||
      intersects(strings(capability.queries), queryIds) ||
      resources.has(capability.resource);
    if (matches && typeof capability.id === "string") requiredCapabilityIds.add(capability.id);
    return matches || requiredCapabilityIds.has(String(capability.id));
  });
  const actorCapabilityFixture = records(authority.actorCapabilityFixture)
    .filter((fixture) => actorIds.has(fixture.actorId))
    .map((fixture) => ({
      ...fixture,
      capabilities: strings(fixture.capabilities).filter((id) => requiredCapabilityIds.has(id))
    }));

  const includedSections = [
    "meta",
    "scope",
    "actors",
    "components",
    "interactionModel",
    "screens",
    "flows",
    "stateMachines",
    "apiContracts",
    "dataBindings",
    "authority",
    "acceptance",
    "assumptions",
    "openQuestions",
    "demoStoryboard",
    "mockData"
  ];
  const projectedApi = {
    ...api,
    ...(Object.hasOwn(api, "queryContracts")
      ? { queryContracts: selectedQueries }
      : { queries: selectedQueries }),
    ...(Object.hasOwn(api, "commandContracts")
      ? { commandContracts: selectedCommands }
      : { commands: selectedCommands })
  };
  const demoStoryboard = records(source.demoStoryboard).filter(
    (item) =>
      item.status !== "deprecated" &&
      requestedSet.has(String(item.screenId)) &&
      (selectionContract.activeDemoJourneyId === undefined ||
        item.journeyId === selectionContract.activeDemoJourneyId)
  );
  const mockData = records(source.mockData).filter((item) =>
    resources.has(item.entity ?? item.resource ?? item.resourceType)
  );
  const sourceAcceptance = source.acceptance;
  const acceptanceScenarios = Array.isArray(sourceAcceptance)
    ? records(sourceAcceptance)
    : records(record(sourceAcceptance).scenarios);
  const projectedAcceptanceScenarios = acceptanceScenarios.filter((scenario) =>
    records(scenario.evidenceChecks).some((check) => requestedSet.has(String(check.screenId)))
  );
  const projectedAcceptance = Array.isArray(sourceAcceptance)
    ? projectedAcceptanceScenarios
    : {
        ...record(sourceAcceptance),
        scenarios: projectedAcceptanceScenarios
      };

  return {
    schemaVersion: "aawp/spec-to-demo-source-projection/v3",
    projection: {
      sourceByteSha256,
      requestedScreens: selectionContract.requestedScreens,
      includedSections
    },
    selectionContract,
    meta: {
      scenario: record(source.meta).scenario,
      stack: record(source.meta).stack,
      chosenDirection: record(source.meta).chosenDirection,
      revision: record(source.meta).revision
    },
    scope: source.scope ?? null,
    actors: records(source.actors).filter((actor) => actorIds.has(actor.id)),
    components: records(source.components).filter((component) =>
      componentNames.has(component.name)
    ),
    interactionModel: interactions,
    screens,
    flows,
    stateMachines,
    apiContracts: projectedApi,
    dataBindings,
    authority: {
      ...authority,
      capabilities,
      actorCapabilityFixture
    },
    acceptance: sourceAcceptance === undefined ? null : projectedAcceptance,
    assumptions: records(source.assumptions),
    openQuestions: records(source.openQuestions),
    demoStoryboard,
    mockData
  };
}
