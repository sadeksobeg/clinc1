import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db";
import { sessionCookieName } from "@/lib/session";
import { verifyOpsToken } from "@/lib/jwt";

export async function POST() {
  const jar = await cookies();
  const raw = jar.get(sessionCookieName())?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await verifyOpsToken(raw);
  const clinicId = Number(session?.clinicId ?? 0);
  if (!session?.sub || clinicId <= 0) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const pool = getPool();
  await pool.query(
    `UPDATE clinics
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [
      JSON.stringify({
        onboarding_required: true,
        onboarding_completed_at: null,
      }),
      clinicId,
    ],
  );

  return NextResponse.json({ ok: true });
}
