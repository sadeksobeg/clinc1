import { randomUUID } from "crypto";

const HEADER_IDS = ["x-request-id", "x-correlation-id", "x-trace-id"] as const;

/** Read correlation id from inbound HTTP request or generate a new UUID. */
export function getCorrelationIdFromRequest(req: Request): string {
  for (const h of HEADER_IDS) {
    const v = req.headers.get(h)?.trim();
    if (v) return v.slice(0, 256);
  }
  return randomUUID();
}
