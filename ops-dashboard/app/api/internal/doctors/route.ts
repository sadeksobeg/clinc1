import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { getDoctorLimitStatus } from "@/lib/billing/localBilling";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  clinic_id: z.number().int().positive(),
  display_name: z.string().min(2).max(120),
  specialty: z.string().max(120).optional().nullable(),
  slot_duration_minutes: z.number().int().min(5).max(120).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const url = new URL(req.url);
  const clinicId = Math.max(1, Number.parseInt(url.searchParams.get("clinic_id") || "1", 10) || 1);
  try {
    const pool = getPool();
    const limit = await getDoctorLimitStatus(pool, clinicId);
    const r = await pool.query(
      `SELECT id, display_name, specialty, slot_duration_minutes, is_active
       FROM doctors
       WHERE clinic_id = $1 AND deleted_at IS NULL
       ORDER BY is_active DESC, display_name ASC`,
      [clinicId],
    );
    return NextResponse.json({ ok: true, rows: r.rows, limits: limit });
  } catch (e) {
    opsLogError("internal/doctors", e, { clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  const body = parsed.data;
  try {
    const pool = getPool();
    const limit = await getDoctorLimitStatus(pool, body.clinic_id);
    if (limit.reached) {
      return NextResponse.json(
        {
          ok: false,
          error: "doctor_limit_exceeded",
          reason_code: "doctor_limit_exceeded",
          limit: limit.limit,
          current: limit.current,
          source: limit.source,
        },
        { status: 409 },
      );
    }
    const r = await pool.query(
      `INSERT INTO doctors
        (clinic_id, display_name, specialty, slot_duration_minutes, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, display_name, specialty, slot_duration_minutes, is_active`,
      [body.clinic_id, body.display_name.trim(), body.specialty ?? null, body.slot_duration_minutes ?? 15, body.is_active ?? true],
    );
    return NextResponse.json({ ok: true, row: r.rows[0] }, { status: 201 });
  } catch (e) {
    opsLogError("internal/doctors:create", e, { clinic_id: body.clinic_id });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
