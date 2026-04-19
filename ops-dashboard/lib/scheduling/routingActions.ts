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
     SET routing = COALESCE(routing, '{}'::jsonb) || jsonb_build_object('selected_clinic_id', to_jsonb($2::bigint)),
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
     SET routing = COALESCE(routing, '{}'::jsonb) || jsonb_build_object('selected_clinic_id', to_jsonb($2::bigint)),
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId, clinicId],
  );
}
