import type { User } from "./user.js";

export function displayName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
