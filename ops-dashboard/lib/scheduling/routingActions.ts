import type { Pool, PoolClient } from "pg";

export async function listClinics(pool: Pool): Promise<{ id: number; name: string; slug: string }[]> {
  const r = await pool.query(
    `SELECT id, name, slug FROM clinics WHERE deleted_at IS NULL ORDER BY id ASC`,
  );
  return r.rows as { id: number; name: string; slug: string }[];
}

export async function getConversationRouting(
  pool: Pool,
  conversationId: number,
): Promise<Record<string, unknown>> {
  const r = await pool.query(`SELECT routing FROM conversations WHERE id = $1`, [conversationId]);
  return (r.rows[0]?.routing as Record<string, unknown>) || {};
}

export async function setConversationSelectedClinic(
  pool: Pool,
  conversationId: number,
  clinicId: number,
): Promise<void> {
  await pool.query(
    `UPDATE conversations
     SET routing = COALESCE(routing, '{}'::jsonb)
         || jsonb_build_object(
           'selected_clinic_id', to_jsonb($2::bigint),
           'clinic_selection_locked', to_jsonb(true)
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId, clinicId],
  );
}

export async function setConversationSelectedClinicTx(
  client: PoolClient,
  conversationId: number,
  clinicId: number,
): Promise<void> {
  await client.query(
    `UPDATE conversations
     SET routing = COALESCE(routing, '{}'::jsonb)
         || jsonb_build_object(
           'selected_clinic_id', to_jsonb($2::bigint),
           'clinic_selection_locked', to_jsonb(true)
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId, clinicId],
  );
}

export async function setConversationSelectedSpecialty(
  pool: Pool,
  conversationId: number,
  specialtyId: number,
  code: string,
): Promise<void> {
  await pool.query(
    `UPDATE conversations
     SET routing = COALESCE(routing, '{}'::jsonb)
         || jsonb_build_object(
           'selected_specialty_id', to_jsonb($2::bigint),
           'selected_specialty_code', to_jsonb($3::text)
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId, specialtyId, code],
  );
}

export async function setConversationSelectedDoctor(
  pool: Pool,
  conversationId: number,
  doctorId: number,
  clinicId: number,
): Promise<void> {
  await pool.query(
    `UPDATE conversations
     SET routing = COALESCE(routing, '{}'::jsonb)
         || jsonb_build_object(
           'selected_doctor_id', to_jsonb($2::bigint),
           'selected_clinic_id', to_jsonb($3::bigint),
           'clinic_selection_locked', to_jsonb(true)
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId, doctorId, clinicId],
  );
}

export type SpecialtyForRouting = {
  id: number;
  code: string;
  label_ar: string;
  sort_order: number;
};

/**
 * Distinct active specialties offered by any of `clinicIds` (per `clinic_specialties`),
 * intersected with the global `specialties` catalog. When `clinicIds` is empty,
 * returns ALL active specialties (admin manages availability via clinic_specialties).
 */
export async function listSpecialtiesForClinics(
  pool: Pool,
  clinicIds: number[],
): Promise<SpecialtyForRouting[]> {
  if (!clinicIds.length) {
    const r = await pool.query(
      `SELECT id, code, label_ar, sort_order
         FROM specialties
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, id ASC
        LIMIT 12`,
    );
    return r.rows as SpecialtyForRouting[];
  }
  const r = await pool.query(
    `SELECT s.id, s.code, s.label_ar, s.sort_order
       FROM specialties s
       JOIN clinic_specialties cs ON cs.specialty_id = s.id AND cs.is_active = TRUE
      WHERE s.is_active = TRUE AND cs.clinic_id = ANY($1::bigint[])
      GROUP BY s.id
      ORDER BY MIN(s.sort_order) ASC, s.id ASC
      LIMIT 12`,
    [clinicIds],
  );
  return r.rows as SpecialtyForRouting[];
}
