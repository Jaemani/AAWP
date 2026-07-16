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
    validateApiSemantics(document, findings);
    validateSharedResourceScreens(document, findings);
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
      .filter((finding) => finding.blocker === "DEMO_BLOCKER")
      .map((finding) => ({
        code: finding.code,
        message: finding.message,
        ...(finding.pointers[0] === undefined ? {} : { pointer: finding.pointers[0] })
      }))
  };
}
