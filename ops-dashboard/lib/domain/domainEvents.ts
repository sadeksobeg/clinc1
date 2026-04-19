import type { Pool } from "pg";

export type DomainEventInput = {
  clinic_id: number;
  conversation_id: number | null;
  event_type: string;
  payload: Record<string, unknown>;
  correlation_id?: string | null;
};

export async function appendDomainEvent(pool: Pool, input: DomainEventInput): Promise<number> {
  const r = await pool.query(
    `INSERT INTO domain_events (clinic_id, conversation_id, event_type, payload, correlation_id, occurred_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
     RETURNING id`,
    [
      input.clinic_id,
      input.conversation_id,
      input.event_type.slice(0, 200),
      JSON.stringify(input.payload),
      input.correlation_id?.slice(0, 256) ?? null,
    ],
  );
  return Number(r.rows[0]?.id ?? 0);
}

export async function listDomainEventsForConversation(
  pool: Pool,
  args: { conversation_id: number; limit: number },
): Promise<
  Array<{
    id: number;
    event_type: string;
    payload: unknown;
    correlation_id: string | null;
    occurred_at: string;
  }>
> {
  const { rows } = await pool.query(
    `SELECT id, event_type, payload, correlation_id, occurred_at::text AS occurred_at
     FROM domain_events
     WHERE conversation_id = $1
     ORDER BY id DESC
     LIMIT $2`,
    [args.conversation_id, Math.min(Math.max(args.limit, 1), 500)],
  );
  return rows as Array<{
    id: number;
    event_type: string;
    payload: unknown;
    correlation_id: string | null;
    occurred_at: string;
  }>;
}
