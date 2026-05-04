import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { retrySystemJob } from "@/lib/system/jobs";

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }
  const ok = await retrySystemJob(getPool(), id);
  if (!ok) return NextResponse.json({ ok: false, error: "job_not_retryable" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
