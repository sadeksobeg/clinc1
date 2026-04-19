import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

const patchSchema = z.object({
  clinic_id: z.number().int().positive(),
  status: z.enum(["pending", "confirmed", "cancelled", "no_show", "completed"]).optional(),
  starts_at: z.string().min(10).optional(),
  ends_at: z.string().min(10).optional(),
  patient_arrival_state: z.enum(["expected", "late", "checked_in", "no_show"]).optional(),
});

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  const b = parsed.data;
  const pool = getPool();
  const r = await pool.query(
    `UPDATE appointments SET
       status = COALESCE($1::text, status),
       cancelled_at = CASE WHEN $1::text = 'cancelled' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END,
       starts_at = COALESCE($2::timestamptz, starts_at),
       ends_at = COALESCE($3::timestamptz, ends_at),
       patient_arrival_state = COALESCE($4::text, patient_arrival_state),
       updated_at = NOW()
     WHERE id = $5 AND clinic_id = $6 AND deleted_at IS NULL
     RETURNING id, status, starts_at, ends_at, patient_arrival_state`,
    [b.status ?? null, b.starts_at ?? null, b.ends_at ?? null, b.patient_arrival_state ?? null, id, b.clinic_id],
  );
  if (!r.rows[0]) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, appointment: r.rows[0] });
}
