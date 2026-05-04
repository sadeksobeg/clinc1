import type { Pool } from "pg";

type AuditArgs = {
  clinicId?: number | null;
  actorType?: string;
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

export async function insertAuditLog(pool: Pool, args: AuditArgs): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (clinic_id, actor_type, actor_id, action, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      args.clinicId ?? null,
      args.actorType ?? "system",
      args.actorId ?? null,
      args.action,
      args.entityType ?? null,
      args.entityId ?? null,
      JSON.stringify(args.payload ?? {}),
    ],
  );
}

export async function hasIdempotentAudit(
  pool: Pool,
  args: { clinicId: number; action: string; entityId?: string | null; idempotencyKey: string },
): Promise<boolean> {
  const r = await pool.query(
    `SELECT id
     FROM audit_logs
     WHERE clinic_id = $1
       AND action = $2
       AND ($3::text IS NULL OR entity_id = $3::text)
       AND payload->>'idempotency_key' = $4
     ORDER BY created_at DESC
     LIMIT 1`,
    [args.clinicId, args.action, args.entityId ?? null, args.idempotencyKey],
  );
  return Boolean(r.rows[0]);
}
