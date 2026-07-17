import { digestWorkflow } from "@awf/ir";
import type { SpecRevisionFinding } from "./revision.js";

export type MaturityStage = "S0" | "S1" | "S2" | "S3";
export type SemanticBlockerKind =
  "DEMO_BLOCKER" | "PREVIEW_BLOCKER" | "APPLICATION_BLOCKER" | "NON_BLOCKING_GAP";

export interface SemanticFinding {
  id: string;
  code: string;
  blocker: SemanticBlockerKind;
  message: string;
  pointers: string[];
  objectIds: string[];
  sourceRefs: string[];
  affectedStages: MaturityStage[];
  affectedWorkflows: string[];
  autoFixable: boolean;
  owner?: string;
  question?: string;
}

export interface MaturityStageVerdict {
  status: "passed" | "blocked" | "not-evaluated" | "out-of-scope";
  blockerCount: number;
  findingIds: string[];
}

export interface SemanticCompilation {
  gapReport: {
    schemaVersion: "aawp/spec-gap-report/v1";
    findings: SemanticFinding[];
    counts: Record<SemanticBlockerKind, number>;
    digest: string;
  };
  maturityVerdict: {
    schemaVersion: "aawp/spec-maturity-verdict/v1";
    target: MaturityStage;
    stages: Record<MaturityStage, MaturityStageVerdict>;
    digest: string;
  };
  traceabilityReport: {
    schemaVersion: "aawp/spec-traceability-report/v1";
    requirementCount: number;
    fullyLinkedCount: number;
    coverage: number;
    missingRequirementIds: string[];
    linksChecked: string[];
    digest: string;
  };
  decisionStatusCounts: Record<DecisionStatus, number>;
  revisionFindings: SpecRevisionFinding[];
}

type JsonRecord = Record<string, unknown>;
type DecisionStatus = "confirmed" | "assumed" | "unresolved" | "conflicting" | "deprecated";

const CANONICAL_ROOTS = [
  "references",
  "scope",
  "glossary",
  "requirements",
  "domainModel",
  "stateMachines",
  "apiContracts",
  "screens",
  "flows",
  "dataBindings",
  "authority",
  "acceptance",
  "nonFunctional",
  "assumptions",
  "openQuestions",
  "traceability"
] as const;

const DECISION_STATUSES = new Set<DecisionStatus>([
  "confirmed",
  "assumed",
  "unresolved",
  "conflicting",
  "deprecated"
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function idOf(value: JsonRecord): string | undefined {
  for (const key of ["id", "requirementId", "screenId", "flowId", "commandId", "queryId"]) {
    if (typeof value[key] === "string" && value[key].length > 0) return value[key];
  }
  return undefined;
}

function statusOf(value: JsonRecord): DecisionStatus | undefined {
  if (value.status === "assumed_demo_only" || value.status === "assumed_demo_fixture") {
    return "assumed";
  }
  return typeof value.status === "string" && DECISION_STATUSES.has(value.status as DecisionStatus)
    ? (value.status as DecisionStatus)
    : undefined;
}

function sourceReferences(value: JsonRecord): string[] {
  return [
    ...new Set([
      ...strings(value.sourceRefs),
      ...strings(value.feedbackIds),
      ...(typeof value.source === "string" && value.source.length > 0 ? [value.source] : [])
    ])
  ];
}

function stableFinding(input: Omit<SemanticFinding, "id">): SemanticFinding {
  return { ...input, id: `finding_${digestWorkflow(input).slice(0, 24)}` };
}

function addFinding(findings: SemanticFinding[], input: Omit<SemanticFinding, "id">): void {
  findings.push(stableFinding(input));
}

function maturityStagesFor(blocker: SemanticBlockerKind): MaturityStage[] {
  if (blocker === "DEMO_BLOCKER") return ["S1", "S2", "S3"];
  if (blocker === "PREVIEW_BLOCKER") return ["S2", "S3"];
  if (blocker === "APPLICATION_BLOCKER") return ["S3"];
  return [];
}

function workflowsFor(blocker: SemanticBlockerKind): string[] {
  if (blocker === "DEMO_BLOCKER") return ["spec-to-demo", "spec-to-preview", "spec-to-application"];
  if (blocker === "PREVIEW_BLOCKER") return ["spec-to-preview", "spec-to-application"];
  if (blocker === "APPLICATION_BLOCKER") return ["spec-to-application"];
  return [];
}

function baseFinding(
  blocker: SemanticBlockerKind,
  input: {
    code: string;
    message: string;
    pointers?: string[];
    objectIds?: string[];
    sourceRefs?: string[];
    autoFixable?: boolean;
    owner?: string;
    question?: string;
  }
): Omit<SemanticFinding, "id"> {
  return {
    code: input.code,
    blocker,
    message: input.message,
    pointers: input.pointers ?? [],
    objectIds: input.objectIds ?? [],
    sourceRefs: input.sourceRefs ?? [],
    affectedStages: maturityStagesFor(blocker),
    affectedWorkflows: workflowsFor(blocker),
    autoFixable: input.autoFixable ?? false,
    ...(input.owner === undefined ? {} : { owner: input.owner }),
    ...(input.question === undefined ? {} : { question: input.question })
  };
}

function validateCanonicalRoots(document: JsonRecord, findings: SemanticFinding[]): void {
  for (const root of CANONICAL_ROOTS) {
    if (!Object.hasOwn(document, root)) {
      addFinding(
        findings,
        baseFinding("DEMO_BLOCKER", {
          code: "CANONICAL_ROOT_MISSING",
          message: `canonical section ${root} is missing`,
          pointers: [`/${root}`]
        })
      );
    }
  }
}

function validateDecisionProvenance(
  document: JsonRecord,
  findings: SemanticFinding[],
  counts: Record<DecisionStatus, number>
): void {
  const sections = ["requirements", "assumptions", "openQuestions", "nonFunctional"] as const;
  for (const section of sections) {
    records(document[section]).forEach((item, index) => {
      const status = statusOf(item);
      const pointer = `/${section}/${index}`;
      const objectId = idOf(item);
      if (status === undefined) {
        addFinding(
          findings,
          baseFinding("DEMO_BLOCKER", {
            code: "DECISION_STATUS_MISSING",
            message: `${objectId ?? pointer} has no supported decision status`,
            pointers: [pointer],
            objectIds: objectId === undefined ? [] : [objectId]
          })
        );
        return;
      }
      counts[status] += 1;
      const sourceRefs = sourceReferences(item);
      const blocks = strings(item.blocks);
      if (status === "confirmed" && sourceRefs.length === 0) {
        addFinding(
          findings,
          baseFinding("DEMO_BLOCKER", {
            code: "CONFIRMED_WITHOUT_SOURCE",
            message: `${objectId ?? pointer} is confirmed without sourceRefs`,
            pointers: [pointer],
            objectIds: objectId === undefined ? [] : [objectId]
          })
        );
      }
      if (status === "assumed" && (typeof item.reviewOwner !== "string" || blocks.length === 0)) {
        addFinding(
          findings,
          baseFinding("PREVIEW_BLOCKER", {
            code: "ASSUMPTION_REVIEW_CONTRACT_MISSING",
            message: `${objectId ?? pointer} must declare reviewOwner and blocks`,
            pointers: [pointer],
            objectIds: objectId === undefined ? [] : [objectId]
          })
        );
      }
      if (
        status === "unresolved" &&
        (typeof item.question !== "string" || typeof item.owner !== "string" || blocks.length === 0)
      ) {
        addFinding(
          findings,
          baseFinding("PREVIEW_BLOCKER", {
            code: "UNRESOLVED_DECISION_CONTRACT_MISSING",
            message: `${objectId ?? pointer} must declare question, owner and blocks`,
            pointers: [pointer],
            objectIds: objectId === undefined ? [] : [objectId]
          })
        );
      }
      if (status === "unresolved" || status === "conflicting") {
        const blocker: SemanticBlockerKind = blocks.includes("demo")
          ? "DEMO_BLOCKER"
          : blocks.includes("preview")
            ? "PREVIEW_BLOCKER"
            : "APPLICATION_BLOCKER";
        addFinding(
          findings,
          baseFinding(blocker, {
            code: status === "unresolved" ? "OPEN_DECISION" : "CONFLICTING_DECISION",
            message: String(
              item.question ?? item.statement ?? `${objectId ?? pointer} is ${status}`
            ),
            pointers: [pointer],
            objectIds: objectId === undefined ? [] : [objectId],
            sourceRefs,
            ...(typeof item.owner === "string" ? { owner: item.owner } : {}),
            ...(typeof item.question === "string" ? { question: item.question } : {})
          })
        );
      }
    });
  }
}

function validateScreenActions(document: JsonRecord, findings: SemanticFinding[]): void {
  const flows = new Set(
    records(document.flows)
      .map(idOf)
      .filter((id): id is string => id !== undefined)
  );
  const apiContracts = isRecord(document.apiContracts) ? document.apiContracts : {};
  const commandRecords =
    records(apiContracts.commands).length > 0
      ? records(apiContracts.commands)
      : records(apiContracts.commandContracts);
  const commands = new Set(commandRecords.map(idOf).filter((id): id is string => id !== undefined));
  const queryRecords =
    records(apiContracts.queries).length > 0
      ? records(apiContracts.queries)
      : records(apiContracts.queryContracts);
  const queries = new Set(queryRecords.map(idOf).filter((id): id is string => id !== undefined));
  const screenIds = new Set(
    records(document.screens)
      .map(idOf)
      .filter((id): id is string => id !== undefined)
  );
  records(document.screens).forEach((screen, screenIndex) => {
    const screenId = idOf(screen) ?? `screen-${screenIndex}`;
    const actions = records(screen.actions);
    if (screen.canonical === true && actions.length === 0) {
      addFinding(
        findings,
        baseFinding("DEMO_BLOCKER", {
          code: "SCREEN_ACTIONS_MISSING",
          message: `canonical screen ${screenId} has no declared actions`,
          pointers: [`/screens/${screenIndex}/actions`],
          objectIds: [screenId]
        })
      );
    }
    actions.forEach((action, actionIndex) => {
      const targetKind = action.targetKind ?? action.targetType;
      const targetId = action.targetId;
      const resolves =
        typeof targetId === "string" &&
        ((targetKind === "flow" && flows.has(targetId)) ||
          (targetKind === "command" && commands.has(targetId)) ||
          (targetKind === "query" && queries.has(targetId)) ||
          (targetKind === "screen" && screenIds.has(targetId)));
      if (!resolves) {
        addFinding(
          findings,
          baseFinding("DEMO_BLOCKER", {
            code: "SCREEN_ACTION_TARGET_UNRESOLVED",
            message: `${screenId} action ${String(action.id)} has no resolvable target`,
            pointers: [`/screens/${screenIndex}/actions/${actionIndex}`],
            objectIds: [screenId, ...(typeof action.id === "string" ? [action.id] : [])]
          })
        );
      }
    });
  });
}

const BROWSER_ASSERTIONS = new Set([
  "visible",
  "hidden",
  "navigates",
  "action-specific-surface",
  "state-change",
  "persists-after-reload",
  "work-item-created",
  "no-duplicate",
  "input-preserved-on-error",
  "control-height-consistent",
  "table-no-overflow"
]);
const ACTION_ASSERTIONS = new Set([
  "visible",
  "hidden",
  "navigates",
  "action-specific-surface",
  "state-change",
  "persists-after-reload",
  "work-item-created",
  "no-duplicate",
  "input-preserved-on-error"
]);
const STATE_ASSERTIONS = new Set([
  "state-change",
  "persists-after-reload",
  "work-item-created",
  "no-duplicate"
]);

function validateExecutableAcceptance(document: JsonRecord, findings: SemanticFinding[]): void {
  const acceptance = document.acceptance;
  const scenarios = Array.isArray(acceptance)
    ? records(acceptance)
    : records(isRecord(acceptance) ? acceptance.scenarios : []);
  if (scenarios.length === 0) {
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "ACCEPTANCE_SCENARIOS_MISSING",
        message: "S1 requires at least one acceptance scenario",
        pointers: ["/acceptance"]
      })
    );
    return;
  }
  let executableContractIsValid = true;
  const screens = records(document.screens);
  const screenById = new Map(
    screens.flatMap((screen) => {
      const id = idOf(screen);
      return id === undefined ? [] : [[id, screen] as const];
    })
  );
  const actorIds = new Set(
    records(document.actors)
      .map(idOf)
      .filter((id): id is string => id !== undefined)
  );
  const actionVisibility = new Map<
    string,
    { hidden: boolean; required: boolean; pointers: string[]; objectIds: string[] }
  >();
  scenarios.forEach((scenario, scenarioIndex) => {
    const scenarioId = idOf(scenario) ?? `scenario-${scenarioIndex}`;
    const checks = records(scenario.evidenceChecks);
    if (checks.length === 0) {
      executableContractIsValid = false;
      addFinding(
        findings,
        baseFinding("DEMO_BLOCKER", {
          code: "ACCEPTANCE_BROWSER_EVIDENCE_MISSING",
          message: `${scenarioId} has no executable browser evidence checks`,
          pointers: [`/acceptance/scenarios/${scenarioIndex}/evidenceChecks`],
          objectIds: [scenarioId],
          sourceRefs: sourceReferences(scenario)
        })
      );
      return;
    }
    checks.forEach((check, checkIndex) => {
      const pointer = `/acceptance/scenarios/${scenarioIndex}/evidenceChecks/${checkIndex}`;
      const screenId = check.screenId;
      const screen = typeof screenId === "string" ? screenById.get(screenId) : undefined;
      const screenActions = records(screen?.actions);
      const actionIds = new Set(screenActions.map((action) => action.id));
      const action = screenActions.find((candidate) => candidate.id === check.actionId);
      const targetType = action?.targetType ?? action?.targetKind;
      const assertions = strings(check.assertions);
      const invalidAssertions = assertions.filter(
        (assertion) => !BROWSER_ASSERTIONS.has(assertion)
      );
      const contradictoryHidden = assertions.includes("hidden") && assertions.length > 1;
      const navigationMismatch =
        (assertions.includes("navigates") && targetType !== "screen") ||
        (targetType === "screen" &&
          assertions.some((assertion) =>
            [
              "action-specific-surface",
              "state-change",
              "persists-after-reload",
              "work-item-created",
              "no-duplicate",
              "input-preserved-on-error"
            ].includes(assertion)
          ));
      const needsAction = assertions.some((assertion) => ACTION_ASSERTIONS.has(assertion));
      const needsStateKeys = assertions.some((assertion) => STATE_ASSERTIONS.has(assertion));
      if (
        typeof screenId === "string" &&
        typeof check.actorId === "string" &&
        typeof check.actionId === "string"
      ) {
        const signature = `${screenId}\u0000${check.actorId}\u0000${check.actionId}`;
        const current = actionVisibility.get(signature) ?? {
          hidden: false,
          required: false,
          pointers: [],
          objectIds: [screenId, check.actorId, check.actionId]
        };
        current.hidden ||= assertions.includes("hidden");
        current.required ||= assertions.some(
          (assertion) => assertion !== "hidden" && ACTION_ASSERTIONS.has(assertion)
        );
        current.pointers.push(pointer);
        actionVisibility.set(signature, current);
      }
      const invalidReasons = [
        ...(typeof check.id === "string" ? [] : ["stable check id is missing"]),
        ...(check.kind === "browser" ? [] : ["kind must be browser"]),
        ...(screen !== undefined ? [] : [`source screen is missing: ${String(screenId)}`]),
        ...(check.actorId === undefined || actorIds.has(String(check.actorId))
          ? []
          : [`actor is unresolved: ${String(check.actorId)}`]),
        ...(!needsAction || (typeof check.actionId === "string" && actionIds.has(check.actionId))
          ? []
          : [`action is not declared on source screen: ${String(check.actionId)}`]),
        ...(!needsStateKeys || strings(check.stateKeys).length > 0
          ? []
          : ["state assertion has no stateKeys"]),
        ...(assertions.length > 0 ? [] : ["assertions are missing"]),
        ...(invalidAssertions.length === 0
          ? []
          : [`unsupported assertions: ${invalidAssertions.join(", ")}`]),
        ...(contradictoryHidden ? ["hidden cannot be combined with another assertion"] : []),
        ...(navigationMismatch
          ? ["screen-target action must use visible+navigates without command/state assertions"]
          : [])
      ];
      const valid = invalidReasons.length === 0;
      if (!valid) {
        executableContractIsValid = false;
        addFinding(
          findings,
          baseFinding("DEMO_BLOCKER", {
            code: "ACCEPTANCE_BROWSER_EVIDENCE_INVALID",
            message: `${scenarioId} evidence check ${String(check.id ?? checkIndex)} is not executable: ${invalidReasons.join("; ")}`,
            pointers: [pointer],
            objectIds: [
              scenarioId,
              ...(typeof check.id === "string" ? [check.id] : []),
              ...(typeof screenId === "string" ? [screenId] : [])
            ],
            sourceRefs: sourceReferences(check)
          })
        );
      }
    });
  });
  for (const contract of actionVisibility.values()) {
    if (!contract.hidden || !contract.required) continue;
    executableContractIsValid = false;
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "ACCEPTANCE_ACTION_VISIBILITY_CONTRADICTED",
        message: `${contract.objectIds.join("/")} is both hidden and required for the same actor`,
        pointers: contract.pointers,
        objectIds: contract.objectIds
      })
    );
  }
  if (executableContractIsValid) {
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "DEMO_EVIDENCE_PENDING",
        message: "S1 browser evidence has not been produced by spec-to-demo",
        pointers: ["/acceptance"],
        objectIds: scenarios.map(idOf).filter((id): id is string => id !== undefined),
        sourceRefs: [...new Set(scenarios.flatMap(sourceReferences))]
      })
    );
  }
}

function validateApiSemantics(document: JsonRecord, findings: SemanticFinding[]): void {
  const apiContracts = isRecord(document.apiContracts) ? document.apiContracts : {};
  const commandRecords =
    records(apiContracts.commands).length > 0
      ? records(apiContracts.commands)
      : records(apiContracts.commandContracts);
  const capabilities = new Set(
    records(isRecord(document.authority) ? document.authority.capabilities : [])
      .map(idOf)
      .filter((id): id is string => id !== undefined)
  );
  const transitions = new Set(
    records(document.stateMachines)
      .flatMap((machine) =>
        records(machine.transitions).flatMap((transition) => {
          const explicit = idOf(transition);
          const derived =
            typeof machine.resource === "string" &&
            typeof transition.from === "string" &&
            typeof transition.to === "string"
              ? `${machine.resource}:${transition.from}->${transition.to}`
              : undefined;
          return [explicit, derived].filter((id): id is string => id !== undefined);
        })
      )
      .filter((id): id is string => id !== undefined)
  );
  commandRecords.forEach((command, index) => {
    const commandId = idOf(command) ?? `command-${index}`;
    const pointer = `/apiContracts/commands/${index}`;
    const capabilityId = command.capabilityId ?? command.authorityCapability;
    if (typeof capabilityId !== "string" || !capabilities.has(capabilityId)) {
      addFinding(
        findings,
        baseFinding("PREVIEW_BLOCKER", {
          code: "COMMAND_CAPABILITY_UNRESOLVED",
          message: `${commandId} has no resolvable server capability`,
          pointers: [pointer],
          objectIds: [commandId]
        })
      );
    }
    const transitionId = command.transitionId ?? command.transitionRef;
    if (typeof transitionId !== "string" || !transitions.has(transitionId)) {
      addFinding(
        findings,
        baseFinding("PREVIEW_BLOCKER", {
          code: "COMMAND_TRANSITION_UNRESOLVED",
          message: `${commandId} has no resolvable state transition`,
          pointers: [pointer],
          objectIds: [commandId]
        })
      );
    }
    const requires = strings(command.requires);
    const expectsVersion =
      command.expectedResourceVersion === true || requires.includes("resourceVersion");
    const requiresIdempotency =
      command.idempotencyRequired === true ||
      requires.includes("idempotencyKey") ||
      (typeof command.idempotency === "string" && command.idempotency.length > 0);
    if (!expectsVersion || !requiresIdempotency) {
      addFinding(
        findings,
        baseFinding("PREVIEW_BLOCKER", {
          code: "COMMAND_CONCURRENCY_CONTRACT_INCOMPLETE",
          message: `${commandId} must require resource version and idempotency`,
          pointers: [pointer],
          objectIds: [commandId]
        })
      );
    }
  });
  const commandIds = commandRecords.map(idOf).filter((id): id is string => id !== undefined);
  if (commandIds.some((id) => /approve.*(policy|roster).*(and|payout)|approve-all/iu.test(id))) {
    addFinding(
      findings,
      baseFinding("PREVIEW_BLOCKER", {
        code: "APPROVAL_BOUNDARIES_COLLAPSED",
        message: "policy approval, roster approval and payout handoff must be separate commands",
        pointers: ["/apiContracts/commands"]
      })
    );
  }
}

function validateSharedResourceScreens(document: JsonRecord, findings: SemanticFinding[]): void {
  const active = records(document.screens).filter((screen) => screen.canonical === true);
  const grouped = new Map<string, JsonRecord[]>();
  for (const screen of active) {
    if (typeof screen.resourceType !== "string") continue;
    const purpose = typeof screen.resourcePurpose === "string" ? screen.resourcePurpose : "";
    const key = `${screen.resourceType}::${purpose}`;
    grouped.set(key, [...(grouped.get(key) ?? []), screen]);
  }
  for (const [key, screens] of grouped) {
    if (screens.length < 2) continue;
    const routes = new Set(
      screens.map((screen) => screen.route).filter((route) => typeof route === "string")
    );
    const roleScoped = screens.filter((screen) => strings(screen.actors).length === 1);
    if (routes.size > 1 && roleScoped.length === screens.length) {
      addFinding(
        findings,
        baseFinding("DEMO_BLOCKER", {
          code: "PROBABLE_ROLE_BASED_DUPLICATE",
          message: `${key} is represented by role-specific screens instead of one shared resource screen`,
          pointers: ["/screens"],
          objectIds: screens.map(idOf).filter((id): id is string => id !== undefined)
        })
      );
    }
  }
  const navLabels: string[] = [];
  const collectNavLabels = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collectNavLabels);
      return;
    }
    if (!isRecord(value)) return;
    if (Array.isArray(value.items)) {
      for (const item of records(value.items)) {
        if (typeof item.label === "string") navLabels.push(item.label);
      }
    }
    for (const child of Object.values(value)) collectNavLabels(child);
  };
  collectNavLabels(document.navModel);
  if (navLabels.some((label) => /청년기본소득/u.test(label))) {
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "POLICY_INSTANCE_USED_AS_NAVIGATION",
        message: "청년기본소득 must be a policy-list row, not product navigation",
        pointers: ["/navModel"]
      })
    );
  }
}

function validateDemoProjectionConsistency(
  document: JsonRecord,
  findings: SemanticFinding[]
): void {
  const scope = isRecord(document.scope) ? document.scope : {};
  const deprecatedScreens = records(scope.deprecatedCompatibilityScreens);
  const deprecatedScreenIds = new Set(
    deprecatedScreens
      .filter((screen) => screen.status === undefined || screen.status === "deprecated")
      .map(idOf)
      .filter((id): id is string => id !== undefined)
  );
  const selectedScreenIds = strings(scope.selectedScreensForS1Evidence);
  const screenIds = new Set(
    records(document.screens)
      .map(idOf)
      .filter((id): id is string => id !== undefined)
  );
  const entryScreenId =
    typeof scope.entryScreenId === "string" && scope.entryScreenId.length > 0
      ? scope.entryScreenId
      : undefined;

  if (selectedScreenIds.length > 0 && entryScreenId === undefined) {
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "DEMO_ENTRY_SCREEN_MISSING",
        message: "scope.entryScreenId is required when S1 evidence screens are selected",
        pointers: ["/scope/entryScreenId"]
      })
    );
  } else if (entryScreenId !== undefined) {
    const invalidReason = !screenIds.has(entryScreenId)
      ? "does not resolve to a screen"
      : deprecatedScreenIds.has(entryScreenId)
        ? "is deprecated"
        : selectedScreenIds.length > 0 && !selectedScreenIds.includes(entryScreenId)
          ? "is outside selectedScreensForS1Evidence"
          : undefined;
    if (invalidReason !== undefined) {
      addFinding(
        findings,
        baseFinding("DEMO_BLOCKER", {
          code: "DEMO_ENTRY_SCREEN_INVALID",
          message: `scope.entryScreenId ${entryScreenId} ${invalidReason}`,
          pointers: ["/scope/entryScreenId"],
          objectIds: [entryScreenId]
        })
      );
    }
  }

  for (const screenId of selectedScreenIds) {
    if (!deprecatedScreenIds.has(screenId)) continue;
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "DEPRECATED_SCREEN_SELECTED_FOR_DEMO",
        message: `deprecated compatibility screen ${screenId} is selected for S1 evidence`,
        pointers: ["/scope/selectedScreensForS1Evidence"],
        objectIds: [screenId]
      })
    );
  }

  const acceptance = document.acceptance;
  const scenarios = Array.isArray(acceptance)
    ? records(acceptance)
    : records(isRecord(acceptance) ? acceptance.scenarios : []);
  scenarios.forEach((scenario, scenarioIndex) => {
    records(scenario.evidenceChecks).forEach((check, checkIndex) => {
      if (typeof check.screenId !== "string" || !deprecatedScreenIds.has(check.screenId)) return;
      addFinding(
        findings,
        baseFinding("DEMO_BLOCKER", {
          code: "ACCEPTANCE_USES_DEPRECATED_SCREEN",
          message: `active acceptance uses deprecated screen ${check.screenId}`,
          pointers: [
            `/acceptance/scenarios/${scenarioIndex}/evidenceChecks/${checkIndex}/screenId`
          ],
          objectIds: [check.screenId, ...(typeof check.id === "string" ? [check.id] : [])]
        })
      );
    });
  });

  const activeStoryboards = records(document.demoStoryboard).filter(
    (storyboard) => storyboard.status !== "deprecated"
  );
  activeStoryboards.forEach((storyboard, storyboardIndex) => {
    if (typeof storyboard.screenId !== "string" || !deprecatedScreenIds.has(storyboard.screenId)) {
      return;
    }
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "ACTIVE_STORYBOARD_USES_DEPRECATED_SCREEN",
        message: `active Demo storyboard uses deprecated screen ${storyboard.screenId}`,
        pointers: [`/demoStoryboard/${storyboardIndex}/screenId`],
        objectIds: [
          storyboard.screenId,
          ...(typeof storyboard.journeyId === "string" ? [storyboard.journeyId] : [])
        ]
      })
    );
  });

  const activeJourneyIds = [
    ...new Set(
      activeStoryboards
        .map((storyboard) => storyboard.journeyId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  ];
  const activeDemoJourneyId =
    typeof scope.activeDemoJourneyId === "string" && scope.activeDemoJourneyId.length > 0
      ? scope.activeDemoJourneyId
      : undefined;
  if (activeDemoJourneyId === undefined && activeJourneyIds.length > 1) {
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "ACTIVE_DEMO_JOURNEY_AMBIGUOUS",
        message: `multiple active Demo journeys exist: ${activeJourneyIds.sort().join(", ")}`,
        pointers: ["/scope/activeDemoJourneyId", "/demoStoryboard"],
        objectIds: activeJourneyIds
      })
    );
  } else if (activeDemoJourneyId !== undefined && !activeJourneyIds.includes(activeDemoJourneyId)) {
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "ACTIVE_DEMO_JOURNEY_UNRESOLVED",
        message: `scope.activeDemoJourneyId has no active storyboard: ${activeDemoJourneyId}`,
        pointers: ["/scope/activeDemoJourneyId", "/demoStoryboard"],
        objectIds: [activeDemoJourneyId]
      })
    );
  }
}

function traceability(
  document: JsonRecord,
  findings: SemanticFinding[]
): SemanticCompilation["traceabilityReport"] {
  const requirements = records(document.requirements);
  const traceabilityRoot = document.traceability;
  const traces = Array.isArray(traceabilityRoot)
    ? records(traceabilityRoot)
    : isRecord(traceabilityRoot)
      ? records(traceabilityRoot.links)
      : [];
  const linked = new Set(
    traces
      .filter((trace) => {
        const sources = sourceReferences(trace);
        const screens = [...strings(trace.screenIds), ...strings(trace.screens)];
        const flows = [...strings(trace.flowIds), ...strings(trace.flows)];
        const acceptance = [...strings(trace.acceptanceIds), ...strings(trace.acceptance)];
        return (
          sources.length > 0 && screens.length > 0 && flows.length > 0 && acceptance.length > 0
        );
      })
      .map((trace) => trace.requirementId)
      .filter((id): id is string => typeof id === "string")
  );
  const ids = requirements.map(idOf).filter((id): id is string => id !== undefined);
  const missing = ids.filter((id) => !linked.has(id));
  for (const requirementId of missing) {
    addFinding(
      findings,
      baseFinding("NON_BLOCKING_GAP", {
        code: "TRACEABILITY_INCOMPLETE",
        message: `${requirementId} is not linked from source through acceptance`,
        pointers: ["/traceability"],
        objectIds: [requirementId]
      })
    );
  }
  const content = {
    schemaVersion: "aawp/spec-traceability-report/v1" as const,
    requirementCount: ids.length,
    fullyLinkedCount: ids.length - missing.length,
    coverage: ids.length === 0 ? 0 : (ids.length - missing.length) / ids.length,
    missingRequirementIds: missing,
    linksChecked: ["sourceRefs", "screenIds", "flowIds", "acceptanceIds"]
  };
  return { ...content, digest: digestWorkflow(content) };
}

function stageVerdict(
  stage: MaturityStage,
  findings: SemanticFinding[],
  target: MaturityStage
): MaturityStageVerdict {
  if (stage === "S3" && target !== "S3") {
    return { status: "out-of-scope", blockerCount: 0, findingIds: [] };
  }
  const relevant = findings.filter(
    (finding) => finding.blocker !== "NON_BLOCKING_GAP" && finding.affectedStages.includes(stage)
  );
  return {
    status: relevant.length === 0 ? "passed" : "blocked",
    blockerCount: relevant.length,
    findingIds: relevant.map((finding) => finding.id)
  };
}

export function compileSemanticSpecProfile(
  document: unknown,
  target: MaturityStage = "S2"
): SemanticCompilation {
  const findings: SemanticFinding[] = [];
  const counts: Record<DecisionStatus, number> = {
    confirmed: 0,
    assumed: 0,
    unresolved: 0,
    conflicting: 0,
    deprecated: 0
  };
  if (!isRecord(document)) {
    addFinding(
      findings,
      baseFinding("DEMO_BLOCKER", {
        code: "CANONICAL_DOCUMENT_INVALID",
        message: "canonical spec must be an object",
        pointers: ["/"]
      })
    );
  } else {
    validateCanonicalRoots(document, findings);
    validateDecisionProvenance(document, findings, counts);
    validateScreenActions(document, findings);
    validateExecutableAcceptance(document, findings);
    validateApiSemantics(document, findings);
    validateSharedResourceScreens(document, findings);
    validateDemoProjectionConsistency(document, findings);
  }
  const traceabilityReport = isRecord(document)
    ? traceability(document, findings)
    : {
        schemaVersion: "aawp/spec-traceability-report/v1" as const,
        requirementCount: 0,
        fullyLinkedCount: 0,
        coverage: 0,
        missingRequirementIds: [],
        linksChecked: [],
        digest: digestWorkflow({ invalid: true })
      };
  const blockerCounts: Record<SemanticBlockerKind, number> = {
    DEMO_BLOCKER: 0,
    PREVIEW_BLOCKER: 0,
    APPLICATION_BLOCKER: 0,
    NON_BLOCKING_GAP: 0
  };
  for (const finding of findings) blockerCounts[finding.blocker] += 1;
  const gapContent = {
    schemaVersion: "aawp/spec-gap-report/v1" as const,
    findings,
    counts: blockerCounts
  };
  const gapReport = { ...gapContent, digest: digestWorkflow(gapContent) };
  const stages = {
    S0: stageVerdict("S0", findings, target),
    S1: stageVerdict("S1", findings, target),
    S2: stageVerdict("S2", findings, target),
    S3: stageVerdict("S3", findings, target)
  };
  const maturityContent = {
    schemaVersion: "aawp/spec-maturity-verdict/v1" as const,
    target,
    stages
  };
  return {
    gapReport,
    maturityVerdict: { ...maturityContent, digest: digestWorkflow(maturityContent) },
    traceabilityReport,
    decisionStatusCounts: counts,
    revisionFindings: findings
      .filter(
        (finding) => finding.blocker === "DEMO_BLOCKER" && finding.code !== "DEMO_EVIDENCE_PENDING"
      )
      .map((finding) => ({
        code: finding.code,
        message: finding.message,
        ...(finding.pointers[0] === undefined ? {} : { pointer: finding.pointers[0] })
      }))
  };
}
