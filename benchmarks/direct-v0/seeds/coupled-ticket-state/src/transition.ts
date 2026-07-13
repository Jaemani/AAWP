import type { TicketState } from "./state.js";

export function canTransition(from: TicketState, to: TicketState): boolean {
  return from === "open" && to === "closed";
}
