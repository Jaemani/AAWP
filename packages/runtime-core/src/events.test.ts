import { describe, expect, it } from "vitest";
import {
  DuplicateEventKeyError,
  EventSequenceConflictError,
  EventTenantBoundaryError,
  InMemoryRunEventStore,
  rebuildProjection,
  type AppendRunEvent
} from "./events.js";

function event(eventKey: string, type: AppendRunEvent["type"] = "NodeCompleted"): AppendRunEvent {
  return {
    tenantId: "tenant-a",
    runId: "run-1",
    eventKey,
    type,
    occurredAt: "2026-07-14T00:00:00Z",
    payload: { nodeId: eventKey }
  };
}

describe("append-only run events", () => {
  it("assigns a monotonic sequence and rejects stale expected sequence", async () => {
    const store = new InMemoryRunEventStore();
    await expect(store.append(event("one"), 1)).resolves.toMatchObject({ sequence: 1 });
    await expect(store.append(event("two"), 2)).resolves.toMatchObject({ sequence: 2 });
    await expect(store.append(event("three"), 2)).rejects.toBeInstanceOf(
      EventSequenceConflictError
    );
  });

  it("rejects a duplicate event key", async () => {
    const store = new InMemoryRunEventStore();
    await store.append(event("same"));
    await expect(store.append(event("same"))).rejects.toBeInstanceOf(DuplicateEventKeyError);
  });

  it("rebuilds a projection from the ordered event history", async () => {
    const store = new InMemoryRunEventStore();
    await store.append(event("start", "NodeStarted"));
    await store.append(event("complete", "NodeCompleted"));
    const projection = await rebuildProjection(
      store,
      "tenant-a",
      "run-1",
      { completed: 0 },
      (state, item) => ({ completed: state.completed + (item.type === "NodeCompleted" ? 1 : 0) })
    );
    expect(projection).toEqual({ completed: 1 });
  });

  it("snapshots payloads and rejects cross-tenant access", async () => {
    const store = new InMemoryRunEventStore();
    const payload = { nested: { value: 1 } };
    await store.append({ ...event("snapshot"), payload });
    payload.nested.value = 2;
    expect((await store.list("tenant-a", "run-1"))[0]?.payload).toEqual({
      nested: { value: 1 }
    });
    await expect(store.list("tenant-b", "run-1")).rejects.toBeInstanceOf(EventTenantBoundaryError);
  });
});
