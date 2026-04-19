import type { Pool } from "pg";
import { markAppointmentLate } from "@/lib/scheduling/delayActions";

export type LateDueRow = {
  appointment_id: number;
  clinic_id: number;
};

/** Confirmed appointments past grace (10m after start) still marked expected — alert-only policy. */
export async function loadDueLateAppointments(pool: Pool, clinicId?: number): Promise<LateDueRow[]> {
  const params: unknown[] = [];
  let clinicFilter = "";
  if (clinicId != null) {
    params.push(clinicId);
    clinicFilter = `AND a.clinic_id = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT a.id AS appointment_id, a.clinic_id
     FROM appointments a
     WHERE a.deleted_at IS NULL
       AND a.status = 'confirmed'
       AND a.patient_arrival_state = 'expected'
       AND a.starts_at + interval '10 minutes' < NOW()
       AND a.starts_at > NOW() - interval '4 hours'
       ${clinicFilter}
     ORDER BY a.starts_at ASC
     LIMIT 80`,
    params,
  );
  return r.rows as LateDueRow[];
}

export async function processDueLateAppointments(pool: Pool, clinicId?: number): Promise<{ processed: number }> {
  const rows = await loadDueLateAppointments(pool, clinicId);
  let processed = 0;
  for (const row of rows) {
    const res = await markAppointmentLate(pool, {
      appointmentId: row.appointment_id,
      clinicId: row.clinic_id,
    });
    if (res.ok) processed += 1;
  }
  return { processed };
}
