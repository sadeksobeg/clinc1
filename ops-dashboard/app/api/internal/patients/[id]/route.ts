import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Service-token patient profile for BFF (apps/web). */
export async function GET(req: Request, ctx: Ctx) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  const url = new URL(req.url);
  const clinicId = Math.max(1, Number.parseInt(url.searchParams.get("clinic_id") || "1", 10) || 1);
  const patientId = Number(ctx.params.id);
  if (!Number.isFinite(patientId) || patientId < 1) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const p = await pool.query(
      `SELECT id, chat_id, regexp_replace(chat_id, '\\D', '', 'g') AS wa_phone_digits,
              display_name, phone_e164, status, birth_date, gender, city, is_vip, is_blacklisted,
              notes, insurance_note, first_seen_at, last_seen_at
       FROM patients
       WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [patientId, clinicId],
    );
    if (!p.rows[0]) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const lastConv = await pool.query(
      `SELECT id
       FROM conversations
       WHERE clinic_id = $1 AND patient_id = $2 AND deleted_at IS NULL
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [clinicId, patientId],
    );

    const appts = await pool.query(
      `SELECT id, starts_at, ends_at, status, source_channel, doctor_id, notes
       FROM appointments
       WHERE patient_id = $1 AND clinic_id = $2 AND deleted_at IS NULL
       ORDER BY starts_at DESC
       LIMIT 25`,
      [patientId, clinicId],
    );

    return NextResponse.json({
      ok: true,
      patient: { ...(p.rows[0] as Record<string, unknown>), last_conversation_id: lastConv.rows[0]?.id ?? null },
      appointments: appts.rows,
    });
  } catch (e) {
    opsLogError("internal/patients/[id]", e, { clinic_id: clinicId, patient_id: patientId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
