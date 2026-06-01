/** Tenant-scoped (clinic) read of enabled specialties. Used by clinic /settings UI. */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const clinicId = Number(url.searchParams.get("clinic_id"));
  if (!Number.isFinite(clinicId) || clinicId <= 0) {
    return NextResponse.json({ ok: false, error: "missing_clinic_id" }, { status: 400 });
  }

  const pool = getPool();
  try {
    const r = await pool.query(
      `SELECT s.id, s.code, s.label_ar, s.icon, s.sort_order, cs.is_active
         FROM clinic_specialties cs
         JOIN specialties s ON s.id = cs.specialty_id
        WHERE cs.clinic_id = $1
        ORDER BY s.sort_order ASC, s.id ASC`,
      [clinicId],
    );
    return NextResponse.json({ ok: true, rows: r.rows });
  } catch (e) {
    // Table may not exist before migration 045 — return empty list rather than 500.
    return NextResponse.json({ ok: true, rows: [], degraded: true, error: e instanceof Error ? e.message : String(e) });
  }
}
