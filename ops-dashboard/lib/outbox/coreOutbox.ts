import type { Pool, PoolClient } from "pg";

export type CoreOutboxJobType = "whatsapp_send";

export async function enqueueCoreOutbox(
  db: Pool | PoolClient,
  row: {
    clinic_id: number;
    conversation_id: number | null;
    job_type: CoreOutboxJobType;
    payload: Record<string, unknown>;
  },
): Promise<number> {
  const r = await db.query(
    `INSERT INTO core_outbox (clinic_id, conversation_id, job_type, status, payload, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4::jsonb, NOW(), NOW())
     RETURNING id`,
    [row.clinic_id, row.conversation_id, row.job_type, JSON.stringify(row.payload)],
  );
  return Number(r.rows[0].id);
}

export type ClaimedOutboxRow = {
  id: number;
  clinic_id: number;
  conversation_id: number | null;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export async function claimCoreOutboxBatch(pool: Pool, limit: number): Promise<ClaimedOutboxRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sel = await client.query(
      `SELECT id FROM core_outbox
       WHERE status IN ('pending', 'failed')
         AND available_at <= NOW()
         AND attempts < 25
       ORDER BY id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [limit],
    );
    const ids = sel.rows.map((r: { id: string | number }) => Number(r.id));
    if (!ids.length) {
      await client.query("COMMIT");
      return [];
    }
    const upd = await client.query(
      `UPDATE core_outbox
       SET status = 'processing',
           locked_at = NOW(),
           attempts = attempts + 1,
           updated_at = NOW()
       WHERE id = ANY($1::bigint[])
       RETURNING id, clinic_id, conversation_id, job_type, payload, attempts`,
      [ids],
    );
    await client.query("COMMIT");
    return upd.rows.map((r) => ({
      id: Number(r.id),
      clinic_id: Number(r.clinic_id),
      conversation_id: r.conversation_id != null ? Number(r.conversation_id) : null,
      job_type: String(r.job_type),
      payload: (r.payload || {}) as Record<string, unknown>,
      attempts: Number(r.attempts),
    }));
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function markOutboxSent(pool: Pool, id: number): Promise<void> {
  await pool.query(
    `UPDATE core_outbox SET status = 'sent', updated_at = NOW(), last_error = NULL WHERE id = $1`,
    [id],
  );
}

/** Terminal state: policy / HARD DROP (no retries). Prefer migration `005_core_outbox_blocked_status.sql`; falls back to `dead` if `blocked` is invalid. */
export async function markOutboxBlocked(pool: Pool, id: number, err: string): Promise<void> {
  const msg = err.slice(0, 2000);
  try {
    await pool.query(
      `UPDATE core_outbox
       SET status = 'blocked',
           last_error = $2,
           locked_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id, msg],
    );
  } catch {
    await pool.query(
      `UPDATE core_outbox
       SET status = 'dead',
           last_error = $2,
           locked_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id, `blocked_fallback:${msg}`.slice(0, 2000)],
    );
  }
}

export async function markOutboxFailed(pool: Pool, id: number, err: string): Promise<void> {
  const e = err.slice(0, 2000);
  if (/^(kill_switch|no_last_inbound|outside_reply_window|policy_blocked)/i.test(e)) {
    await markOutboxBlocked(pool, id, e);
    return;
  }
  await pool.query(
    `UPDATE core_outbox
     SET status = CASE WHEN attempts >= 25 THEN 'dead' ELSE 'failed' END,
         last_error = $2,
         available_at = NOW() + (INTERVAL '1 second' * LEAST(300, 5 * POWER(2, LEAST(attempts, 8))))::interval,
         updated_at = NOW()
     WHERE id = $1`,
    [id, e],
  );
}
