import type { Order } from "./types.js";

export function totalCents(order: Order): number {
  return order.lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
}
