import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getPool } from "@/lib/db";
import { requireSecretarySession } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

const arrivalStates = new Set(["expected", "late", "checked_in", "no_show"]);

export async function GET(req: NextRequest) {
  const gate = await requireSecretarySession();
  if (!gate.ok) return gate.response;
  const clinicId = Number(gate.session.clinicId);
  const arrival = (req.nextUrl.searchParams.get("arrival") || "all").toLowerCase();
  const pool = getPool();
  const tzr = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [clinicId]);
  const zone = (tzr.rows[0]?.timezone as string) || "Asia/Amman";
  const start = DateTime.now().setZone(zone).startOf("day").toUTC().toISO()!;
  const end = DateTime.now().setZone(zone).endOf("day").toUTC().toISO()!;
  const params: unknown[] = [clinicId, start, end];
  let arrivalSql = "";
  if (arrival !== "all" && arrivalStates.has(arrival)) {
    params.push(arrival);
    arrivalSql = `AND a.patient_arrival_state = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT a.id, a.starts_at, a.ends_at, a.status, a.patient_arrival_state, a.sequence_no,
            p.display_name AS patient_name, p.chat_id,
            d.display_name AS doctor_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id AND p.clinic_id = a.clinic_id
     LEFT JOIN doctors d ON d.id = a.doctor_id
     WHERE a.clinic_id = $1 AND a.deleted_at IS NULL
       AND a.starts_at >= $2::timestamptz AND a.starts_at <= $3::timestamptz
       ${arrivalSql}
     ORDER BY a.starts_at ASC`,
    params,
  );
  return NextResponse.json({ ok: true, appointments: r.rows, timezone: zone, arrival_filter: arrival });
}
