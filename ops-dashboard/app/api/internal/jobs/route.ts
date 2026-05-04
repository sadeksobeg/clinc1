import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { enqueueSystemJob, listSystemJobs } from "@/lib/system/jobs";
import { writeStructuredLog } from "@/lib/observability/trace";

const createSchema = z.object({
  clinic_id: z.number().int().positive().optional(),
  job_type: z.string().min(3).max(120),
  queue_key: z.string().min(1).max(80).optional(),
  priority: z.number().int().min(1).max(100).optional(),
  max_attempts: z.number().int().min(1).max(10).optional(),
  run_after: z.string().optional(),
  idempotency_key: z.string().min(8).max(200).optional(),
  payload: z.record(z.unknown()).optional(),
});

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "all") as "all";
  const queueKey = url.searchParams.get("queue_key") || undefined;
  const limit = Number(url.searchParams.get("limit") || 100);
  const clinicIdFromHeader = Number(req.headers.get("x-clinic-id") || 0);
  const clinicId = clinicIdFromHeader > 0 ? clinicIdFromHeader : null;
  const rows = await listSystemJobs(getPool(), {
    clinicId,
    status: status as never,
    queueKey,
    limit,
  });
  return NextResponse.json({ ok: true, jobs: rows });
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const clinicIdFromHeader = Number(req.headers.get("x-clinic-id") || 0);
  const clinicId = clinicIdFromHeader > 0 ? clinicIdFromHeader : data.clinic_id ?? null;
  const inserted = await enqueueSystemJob(getPool(), {
    clinicId,
    jobType: data.job_type,
    queueKey: data.queue_key,
    priority: data.priority,
    maxAttempts: data.max_attempts,
    runAfter: data.run_after,
    idempotencyKey: data.idempotency_key,
    payload: data.payload,
  });
  await writeStructuredLog({
    level: "info",
    eventName: "job.enqueued",
    requestId: req.headers.get("x-request-id") || null,
    clinicId,
    userId: Number(req.headers.get("x-user-id") || 0) || null,
    jobId: inserted.id,
    payload: { job_type: data.job_type, queue_key: data.queue_key || "default" },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, job_id: inserted.id }, { status: 201 });
}
