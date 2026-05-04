export type LogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogEnvelope = {
  ts: string;
  level: LogLevel;
  source_app: "ops-dashboard" | "apps-web";
  event_name: string;
  request_id: string | null;
  trace_id: string | null;
  clinic_id: number | null;
  user_id: number | null;
  entity_id: string | null;
  job_id: number | null;
  message: string | null;
  payload: Record<string, unknown>;
};

export function normalizeId(value: unknown): number | null {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function envelopeFromRequest(args: {
  req: Request;
  level: LogLevel;
  eventName: string;
  message?: string | null;
  payload?: Record<string, unknown>;
  sourceApp?: "ops-dashboard" | "apps-web";
  entityId?: string | null;
  jobId?: number | null;
}): StructuredLogEnvelope {
  const req = args.req;
  return {
    ts: new Date().toISOString(),
    level: args.level,
    source_app: args.sourceApp ?? "ops-dashboard",
    event_name: args.eventName,
    request_id: req.headers.get("x-request-id")?.trim() || null,
    trace_id: req.headers.get("x-trace-id")?.trim() || null,
    clinic_id: normalizeId(req.headers.get("x-clinic-id")),
    user_id: normalizeId(req.headers.get("x-user-id")),
    entity_id: args.entityId ?? null,
    job_id: normalizeId(args.jobId),
    message: args.message ?? null,
    payload: args.payload ?? {},
  };
}
