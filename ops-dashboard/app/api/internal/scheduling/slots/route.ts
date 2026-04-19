import { NextResponse } from "next/server";
import { z } from "zod";
import { DateTime } from "luxon";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { explainNoSlots, findNextSlots } from "@/lib/scheduling/slotService";

const bodySchema = z.object({
  clinic_id: z.number().int().positive(),
  doctor_id: z.number().int().positive().optional(),
  specialty: z.string().max(120).optional(),
  conversation_id: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  try {
    const pool = getPool();
    let clinicId = parsed.data.clinic_id;
    if (parsed.data.conversation_id) {
      const r = await pool.query(`SELECT routing, clinic_id FROM conversations WHERE id = $1`, [
        parsed.data.conversation_id,
      ]);
      const row = r.rows[0] as { routing: { selected_clinic_id?: number }; clinic_id: number } | undefined;
      const sel = row?.routing && typeof row.routing === "object" ? row.routing.selected_clinic_id : undefined;
      if (typeof sel === "number") clinicId = sel;
    }

    const slots = await findNextSlots(pool, {
      clinicId,
      doctorId: parsed.data.doctor_id,
      specialty: parsed.data.specialty,
      limit: parsed.data.limit,
    });
    const tzR = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [clinicId]);
    const tz = (tzR.rows[0]?.timezone as string) || "Asia/Amman";
    const reply_lines = slots.map((s, i) => {
      const t = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(tz);
      return `${i + 1}) ${s.doctor_name} — ${t.toFormat("yyyy-LL-dd HH:mm")}`;
    });
    let closed_message_ar: string | undefined;
    if (slots.length === 0) {
      const ex = await explainNoSlots(pool, {
        clinicId,
        doctorId: parsed.data.doctor_id,
        specialty: parsed.data.specialty,
      });
      closed_message_ar = ex.closed_message_ar;
    }
    return NextResponse.json({ ok: true, clinic_id: clinicId, slots, reply_lines, closed_message_ar });
  } catch (e) {
    opsLogError("internal/scheduling/slots", e, { clinic_id: parsed.data.clinic_id });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
