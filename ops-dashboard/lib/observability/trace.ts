import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";

export function resolveRequestId(headers: Headers): string {
  const inbound = headers.get("x-request-id")?.trim();
  return inbound && inbound.length >= 8 ? inbound.slice(0, 120) : randomUUID();
}

export async function startRequestTrace(args: {
  requestId: string;
  traceId?: string | null;
  sourceApp: string;
  path: string;
  method: string;
  clinicId?: number | null;
  userId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO request_traces (request_id, source_app, path, method, clinic_id, user_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (request_id) DO NOTHING`,
    [
      args.requestId,
      args.sourceApp,
      args.path,
      args.method,
      args.clinicId ?? null,
      args.userId ?? null,
      JSON.stringify({ trace_id: args.traceId ?? null, ...(args.metadata ?? {}) }),
    ],
  );
}

export async function finishRequestTrace(args: {
  requestId: string;
  statusCode: number;
  durationMs?: number;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE request_traces
     SET status_code = $2,
         ended_at = NOW(),
         duration_ms = COALESCE($3, duration_ms, EXTRACT(MILLISECOND FROM (NOW() - started_at))::int)
     WHERE request_id = $1`,
    [args.requestId, args.statusCode, args.durationMs ?? null],
  );
}

export async function writeStructuredLog(args: {
  level: "debug" | "info" | "warn" | "error";
  eventName: string;
  requestId?: string | null;
  traceId?: string | null;
  clinicId?: number | null;
  userId?: number | null;
  jobId?: number | null;
  entityId?: string | null;
  message?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO structured_logs (request_id, trace_id, clinic_id, user_id, job_id, level, event_name, message, payload)
     VALUES (
       $1,
       CASE WHEN $1::text IS NULL THEN NULL ELSE (SELECT id FROM request_traces WHERE request_id = $1 LIMIT 1) END,
       $2, $3, $4, $5, $6, $7, $8::jsonb
     )`,
    [
      args.requestId ?? null,
      args.clinicId ?? null,
      args.userId ?? null,
      args.jobId ?? null,
      args.level,
      args.eventName,
      args.message ?? null,
      JSON.stringify({
        trace_id: args.traceId ?? null,
        entity_id: args.entityId ?? null,
        ...(args.payload ?? {}),
      }),
    ],
  );
}

export async function captureErrorAggregation(args: {
  severity: "low" | "medium" | "high" | "critical";
  sampleError: string;
  samplePayload?: Record<string, unknown>;
}): Promise<void> {
  const fingerprint = createHash("sha256").update(args.sampleError.trim().toLowerCase()).digest("hex");
  const pool = getPool();
  await pool.query(
    `INSERT INTO error_aggregations (fingerprint, severity, sample_error, sample_payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (fingerprint) DO UPDATE
       SET severity = EXCLUDED.severity,
           last_seen_at = NOW(),
           occurrences = error_aggregations.occurrences + 1,
           sample_error = EXCLUDED.sample_error,
           sample_payload = EXCLUDED.sample_payload`,
    [fingerprint, args.severity, args.sampleError.slice(0, 1000), JSON.stringify(args.samplePayload ?? {})],
  );
}
