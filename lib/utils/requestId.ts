import { randomUUID } from "crypto";

export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
