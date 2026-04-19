import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { listClinics } from "@/lib/scheduling/routingActions";

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const pool = getPool();
  const clinics = await listClinics(pool);
  return NextResponse.json({ ok: true, clinics });
}
