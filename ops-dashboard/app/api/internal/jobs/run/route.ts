import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { runSingleDueJob } from "@/lib/system/jobs";
import { writeStructuredLog } from "@/lib/observability/trace";

async function runJobType(args: { jobType: string; payload: Record<string, unknown>; clinicId: number | null; jobId: number }) {
  if (args.jobType === "billing.reminders.run") {
    const triggerSource = typeof args.payload.trigger_source === "string" ? args.payload.trigger_source : "job_runner";
    return { ok: true, output: { trigger_source: triggerSource, delegated: true } };
  }
  if (args.jobType === "analytics.trial.rollup.compute") {
    return { ok: true, output: { delegated: true } };
  }
  return { ok: false, error: `unknown_job_type:${args.jobType}` };
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const run = await runSingleDueJob(getPool(), runJobType);
  if (!run.ran) {
    return NextResponse.json({ ok: true, ran: false, message: "no_due_jobs" });
  }
  await writeStructuredLog({
    level: run.status === "completed" ? "info" : "warn",
    eventName: "job.runner.tick",
    requestId: req.headers.get("x-request-id") || null,
    clinicId: Number(req.headers.get("x-clinic-id") || 0) || null,
    userId: Number(req.headers.get("x-user-id") || 0) || null,
    jobId: run.jobId ?? null,
    payload: { status: run.status },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, ran: true, job_id: run.jobId, status: run.status });
}
