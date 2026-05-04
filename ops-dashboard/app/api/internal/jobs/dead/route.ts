import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { listSystemJobs } from "@/lib/system/jobs";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicIdFromHeader = Number(req.headers.get("x-clinic-id") || 0);
  const jobs = await listSystemJobs(getPool(), {
    clinicId: clinicIdFromHeader > 0 ? clinicIdFromHeader : null,
    status: "failed_dead",
    limit: 200,
  });
  return NextResponse.json({ ok: true, jobs });
}
