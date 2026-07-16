import { digestWorkflow } from "@awf/ir";
import type {
  ApiCommandContract,
  ApiContract,
  ApiQueryContract,
  ContractDecisionStatus,
  DataContract,
  LogicalEntityContract,
  PreviewBlockerInput,
  PreviewBlockerOwner,
  PreviewBlockerRouting,
  PreviewContractCompilation,
  PreviewContractSource,
  QueryDataContract,
  RoutedPreviewBlocker,
  ScreenDataBindingContract
} from "./contracts.js";

type JsonRecord = Record<string, unknown>;

const DECISION_STATUSES = new Set<ContractDecisionStatus>([
  "confirmed",
  "assumed",
  "unresolved",
  "conflicting",
  "deprecated",
  "candidate"
]);

const OWNER_ORDER: PreviewBlockerOwner[] = [
  "data",
  "api",
  "authority",
  "environment",
  "product-decision"
];

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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredId(value: JsonRecord, kind: string, index: number): string {
  for (const key of ["id", "commandId", "queryId", "screenId"]) {
    const candidate = optionalString(value[key]);
    if (candidate !== undefined) return candidate;
  }
  return `${kind}-${index}`;
}

function decisionStatus(value: unknown): ContractDecisionStatus {
  if (value === "assumed_demo_only" || value === "assumed_demo_fixture") return "assumed";
  return typeof value === "string" && DECISION_STATUSES.has(value as ContractDecisionStatus)
    ? (value as ContractDecisionStatus)
    : "unresolved";
}

function sourceRefs(value: JsonRecord): string[] {
  return [
    ...new Set([
      ...strings(value.sourceRefs),
      ...strings(value.feedbackIds),
      ...(optionalString(value.source) === undefined ? [] : [String(value.source)])
    ])
  ];
}

function blockerOwners(blocker: PreviewBlockerInput): PreviewBlockerOwner[] {
  const haystack = [
    blocker.code,
    blocker.message,
    ...(blocker.pointers ?? []),
    ...(blocker.objectIds ?? [])
  ].join(" ");
  const owners = new Set<PreviewBlockerOwner>();
  if (/DATA|ENTITY|QUERY|BINDING|FIELD|PII|STORAGE|DATABASE|DB/iu.test(haystack)) {
    owners.add("data");
  }
  if (/API|COMMAND|TRANSITION|SIDE.?EFFECT|IDEMPOT|CONCURRENCY|APPROVAL/iu.test(haystack)) {
    owners.add("api");
  }
  if (/AUTH|CAPABILITY|PERMISSION|SOD|SEPARATION|ROLE/iu.test(haystack)) {
    owners.add("authority");
  }
  if (/ENVIRONMENT|NETWORK|SECRET|RUNTIME|DEPLOY/iu.test(haystack)) {
    owners.add("environment");
  }
  if (owners.size === 0 || blocker.question !== undefined || blocker.owner !== undefined) {
    owners.add("product-decision");
  }
  return OWNER_ORDER.filter((owner) => owners.has(owner));
}

export function routePreviewBlockers(blockers: PreviewBlockerInput[]): PreviewBlockerRouting {
  const routed: RoutedPreviewBlocker[] = blockers
    .map((blocker) => ({ ...blocker, contractOwners: blockerOwners(blocker) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const byOwner = Object.fromEntries(
    OWNER_ORDER.map((owner) => [
      owner,
      routed
        .filter((blocker) => blocker.contractOwners.includes(owner))
        .map((blocker) => blocker.id)
    ])
  ) as Record<PreviewBlockerOwner, string[]>;
  const content = {
    schemaVersion: "aawp/preview-blocker-routing/v1" as const,
    status: routed.length === 0 ? ("ready" as const) : ("blocked" as const),
    blockers: routed,
    byOwner
  };
  return { ...content, digest: digestWorkflow(content) };
}

function queryRecords(document: JsonRecord): JsonRecord[] {
  const api = isRecord(document.apiContracts) ? document.apiContracts : {};
  return records(api.queries).length > 0 ? records(api.queries) : records(api.queryContracts);
}

function commandRecords(document: JsonRecord): JsonRecord[] {
  const api = isRecord(document.apiContracts) ? document.apiContracts : {};
  return records(api.commands).length > 0 ? records(api.commands) : records(api.commandContracts);
}

function entities(document: JsonRecord): LogicalEntityContract[] {
  const domain = isRecord(document.domainModel) ? document.domainModel : {};
  return records(domain.entities).map((entity, index) => ({
    id: requiredId(entity, "entity", index),
    ...(optionalString(entity.name) === undefined ? {} : { name: String(entity.name) }),
    ...(optionalString(entity.responsibility) === undefined
      ? {}
      : { responsibility: String(entity.responsibility) }),
    relationships: strings(entity.relationships),
    status: decisionStatus(entity.status),
    sourceRefs: sourceRefs(entity),
    physicalStorage: {
      status: "unresolved",
      reason:
        "Logical Spec entities do not select a database product, table, partition, or PII store."
    }
  }));
}

function queryCapabilityMap(document: JsonRecord): Map<string, string> {
  const authority = isRecord(document.authority) ? document.authority : {};
  const candidates = new Map<string, Set<string>>();
  for (const capability of records(authority.capabilities)) {
    const capabilityId = optionalString(capability.id);
    if (capabilityId === undefined) continue;
    for (const queryId of strings(capability.queries)) {
      const values = candidates.get(queryId) ?? new Set<string>();
      values.add(capabilityId);
      candidates.set(queryId, values);
    }
  }
  return new Map(
    [...candidates]
      .filter(([, values]) => values.size === 1)
      .map(([queryId, values]) => [queryId, [...values][0] as string])
  );
}

function normalizeQuery(
  query: JsonRecord,
  index: number,
  capabilities: Map<string, string>
): ApiQueryContract {
  const id = requiredId(query, "query", index);
  const capabilityId =
    optionalString(query.capabilityId ?? query.authorityCapability) ?? capabilities.get(id);
  const resource = optionalString(query.resource);
  return {
    id,
    status: decisionStatus(query.status),
    ...(capabilityId === undefined ? {} : { capabilityId }),
    reads: [
      ...strings(query.reads),
      ...strings(query.entities),
      ...(resource === undefined ? [] : [resource])
    ],
    responseFields: [
      ...strings(query.responseFields),
      ...strings(query.fields),
      ...strings(query.returns)
    ],
    sourceRefs: sourceRefs(query)
  };
}

function normalizeCommand(command: JsonRecord, index: number): ApiCommandContract {
  const requires = strings(command.requires);
  const policy = optionalString(command.idempotency);
  const capabilityId = optionalString(command.capabilityId ?? command.authorityCapability);
  const transitionRef = optionalString(command.transitionId ?? command.transitionRef);
  const requiresIdempotency =
    command.idempotencyRequired === true || requires.includes("idempotencyKey");
  return {
    id: requiredId(command, "command", index),
    status: decisionStatus(command.status),
    ...(capabilityId === undefined ? {} : { capabilityId }),
    ...(transitionRef === undefined ? {} : { transitionRef }),
    requires,
    mutates: strings(command.mutates),
    creates: strings(command.creates),
    separatesFrom: strings(command.separatesFrom),
    optimisticConcurrency: {
      required: command.expectedResourceVersion === true || requires.includes("resourceVersion"),
      source:
        command.expectedResourceVersion === true || requires.includes("resourceVersion")
          ? "resourceVersion"
          : "missing"
    },
    idempotency: {
      required: requiresIdempotency,
      source: requires.includes("idempotencyKey")
        ? "idempotencyKey"
        : policy === undefined
          ? "missing"
          : "declared-policy",
      ...(policy === undefined ? {} : { policy })
    },
    sourceRefs: sourceRefs(command)
  };
}

function bindings(document: JsonRecord): ScreenDataBindingContract[] {
  return records(document.dataBindings).map((binding, index) => ({
    screenId: optionalString(binding.screenId) ?? `screen-binding-${index}`,
    status: decisionStatus(binding.status),
    queryRefs: strings(binding.queryRefs),
    commandRefs: strings(binding.commandRefs),
    unresolvedGaps: strings(binding.unresolvedGaps),
    ...(optionalString(binding.fieldSourcePolicy) === undefined
      ? {}
      : { fieldSourcePolicy: String(binding.fieldSourcePolicy) }),
    sourceRefs: sourceRefs(binding)
  }));
}

function unresolvedContracts(document: JsonRecord): unknown[] {
  const api = isRecord(document.apiContracts) ? document.apiContracts : {};
  return Array.isArray(api.unresolvedContracts) ? api.unresolvedContracts : [];
}

export function compilePreviewContracts(input: {
  document: unknown;
  source: PreviewContractSource;
  blockers?: PreviewBlockerInput[];
}): PreviewContractCompilation {
  if (!isRecord(input.document)) throw new TypeError("preview source Spec must be an object");
  const blockerRouting = routePreviewBlockers(input.blockers ?? []);
  const queryCapabilities = queryCapabilityMap(input.document);
  const queries = queryRecords(input.document).map((query, index) =>
    normalizeQuery(query, index, queryCapabilities)
  );
  const commands = commandRecords(input.document).map(normalizeCommand);
  const status = blockerRouting.status;
  const dataBlockerIds = [
    ...new Set([
      ...blockerRouting.byOwner.data,
      ...blockerRouting.byOwner.authority,
      ...blockerRouting.byOwner["product-decision"]
    ])
  ].sort();
  const apiBlockerIds = [
    ...new Set([
      ...blockerRouting.byOwner.api,
      ...blockerRouting.byOwner.authority,
      ...blockerRouting.byOwner.environment,
      ...blockerRouting.byOwner["product-decision"]
    ])
  ].sort();
  const dataContent = {
    schemaVersion: "aawp/data-contract/v1" as const,
    source: input.source,
    targetMaturity: "S2" as const,
    status,
    entities: entities(input.document),
    queries: queries.map((query): QueryDataContract => ({
      id: query.id,
      status: query.status,
      reads: query.reads,
      responseFields: query.responseFields,
      ...(query.capabilityId === undefined ? {} : { capabilityId: query.capabilityId }),
      sourceRefs: query.sourceRefs
    })),
    bindings: bindings(input.document),
    blockerIds: dataBlockerIds,
    unsupportedPhysicalDecisions: [
      "database product and topology",
      "physical table and index mapping",
      "PII and attachment storage",
      "production retention and migration"
    ]
  };
  const apiContent = {
    schemaVersion: "aawp/api-contract/v1" as const,
    source: input.source,
    targetMaturity: "S2" as const,
    status,
    commands,
    queries,
    unresolvedContracts: unresolvedContracts(input.document),
    blockerIds: apiBlockerIds,
    transport: {
      status: "unresolved" as const,
      reason:
        "Logical query and command contracts do not choose HTTP, RPC, event transport, or status codes."
    }
  };
  const dataContract: DataContract = {
    ...dataContent,
    digest: digestWorkflow(dataContent)
  };
  const apiContract: ApiContract = {
    ...apiContent,
    digest: digestWorkflow(apiContent)
  };
  return { status, dataContract, apiContract, blockerRouting };
}
