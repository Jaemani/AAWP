import { canonicalize } from "@awf/ir";

export type RunEventType =
  | "WorkflowCompiled"
  | "WorkflowPublished"
  | "RoutingDecided"
  | "RunCreated"
  | "RevisionCreated"
  | "InvalidationComputed"
  | "NodeScheduled"
  | "NodeStarted"
  | "ToolInvoked"
  | "ModelInvoked"
  | "ArtifactPublished"
  | "CacheHit"
  | "NodeCompleted"
  | "NodeFailed"
  | "ApprovalRequested"
  | "ApprovalResolved"
  | "SideEffectPrepared"
  | "SideEffectCommitted"
  | "VerifierStarted"
  | "VerifierCompleted"
  | "FindingOpened"
  | "FindingResolved"
  | "CandidateAccepted"
  | "CandidateRolledBack"
  | "RunPaused"
  | "RunCompleted"
  | "RunFailed"
  | "RunCancelled";

export interface AppendRunEvent {
  tenantId: string;
  runId: string;
  eventKey: string;
  type: RunEventType;
  occurredAt: string;
  payload: unknown;
}

export interface StoredRunEvent extends AppendRunEvent {
  sequence: number;
}

export interface RunEventStore {
  append(event: AppendRunEvent, expectedNextSequence?: number): Promise<Readonly<StoredRunEvent>>;
  list(tenantId: string, runId: string): Promise<ReadonlyArray<Readonly<StoredRunEvent>>>;
}

export class EventSequenceConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number
  ) {
    super(`event sequence conflict: expected ${expected}, actual ${actual}`);
    this.name = "EventSequenceConflictError";
  }
}

export class DuplicateEventKeyError extends Error {
  constructor(readonly eventKey: string) {
    super(`duplicate event key: ${eventKey}`);
    this.name = "DuplicateEventKeyError";
  }
}

export class EventTenantBoundaryError extends Error {
  constructor(readonly runId: string) {
    super(`run belongs to another tenant: ${runId}`);
    this.name = "EventTenantBoundaryError";
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function payloadSnapshot(payload: unknown): unknown {
  return deepFreeze(JSON.parse(canonicalize(payload)) as unknown);
}

export class InMemoryRunEventStore implements RunEventStore {
  private readonly tenantByRun = new Map<string, string>();
  private readonly eventsByRun = new Map<string, Array<Readonly<StoredRunEvent>>>();
  private readonly eventKeysByRun = new Map<string, Set<string>>();

  async append(
    event: AppendRunEvent,
    expectedNextSequence?: number
  ): Promise<Readonly<StoredRunEvent>> {
    const owner = this.tenantByRun.get(event.runId);
    if (owner !== undefined && owner !== event.tenantId)
      throw new EventTenantBoundaryError(event.runId);
    const events = this.eventsByRun.get(event.runId) ?? [];
    const nextSequence = events.length + 1;
    if (expectedNextSequence !== undefined && expectedNextSequence !== nextSequence) {
      throw new EventSequenceConflictError(expectedNextSequence, nextSequence);
    }
    const eventKeys = this.eventKeysByRun.get(event.runId) ?? new Set<string>();
    if (eventKeys.has(event.eventKey)) throw new DuplicateEventKeyError(event.eventKey);

    const stored = deepFreeze({
      ...event,
      sequence: nextSequence,
      payload: payloadSnapshot(event.payload)
    });
    this.tenantByRun.set(event.runId, event.tenantId);
    events.push(stored);
    eventKeys.add(event.eventKey);
    this.eventsByRun.set(event.runId, events);
    this.eventKeysByRun.set(event.runId, eventKeys);
    return stored;
  }

  async list(tenantId: string, runId: string): Promise<ReadonlyArray<Readonly<StoredRunEvent>>> {
    const owner = this.tenantByRun.get(runId);
    if (owner !== undefined && owner !== tenantId) throw new EventTenantBoundaryError(runId);
    return Object.freeze([...(this.eventsByRun.get(runId) ?? [])]);
  }
}

export async function rebuildProjection<State>(
  store: RunEventStore,
  tenantId: string,
  runId: string,
  initialState: State,
  reducer: (state: State, event: Readonly<StoredRunEvent>) => State
): Promise<State> {
  let state = initialState;
  for (const event of await store.list(tenantId, runId)) state = reducer(state, event);
  return state;
}
