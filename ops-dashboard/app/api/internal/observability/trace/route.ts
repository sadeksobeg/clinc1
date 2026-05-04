import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { finishRequestTrace, startRequestTrace, writeStructuredLog } from "@/lib/observability/trace";

const schema = z.object({
  action: z.enum(["start", "finish", "log"]),
  request_id: z.string().min(8).max(120),
  trace_id: z.string().min(16).max(128).optional(),
  source_app: z.string().min(3).max(40).optional(),
  path: z.string().max(500).optional(),
  method: z.string().max(20).optional(),
  clinic_id: z.number().int().positive().optional(),
  user_id: z.number().int().positive().optional(),
  status_code: z.number().int().min(100).max(599).optional(),
  duration_ms: z.number().int().min(0).optional(),
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  event_name: z.string().min(2).max(120).optional(),
  entity_id: z.string().max(120).optional(),
  job_id: z.number().int().positive().optional(),
  message: z.string().max(500).optional(),
  payload: z.record(z.unknown()).optional(),
});

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.action === "start") {
    await startRequestTrace({
      requestId: data.request_id,
      traceId: data.trace_id ?? null,
      sourceApp: data.source_app || "apps-web",
      path: data.path || "unknown",
      method: data.method || "GET",
      clinicId: data.clinic_id ?? null,
      userId: data.user_id ?? null,
      metadata: data.payload ?? {},
    });
    return NextResponse.json({ ok: true });
  }
  if (data.action === "finish") {
    await finishRequestTrace({
      requestId: data.request_id,
      statusCode: data.status_code || 200,
      durationMs: data.duration_ms,
    });
    return NextResponse.json({ ok: true });
  }
  await writeStructuredLog({
    level: data.level || "info",
    eventName: data.event_name || "request.log",
    requestId: data.request_id,
    traceId: data.trace_id ?? null,
    clinicId: data.clinic_id ?? null,
    userId: data.user_id ?? null,
    jobId: data.job_id ?? null,
    entityId: data.entity_id ?? null,
    message: data.message,
    payload: data.payload ?? {},
  });
  return NextResponse.json({ ok: true });
}
