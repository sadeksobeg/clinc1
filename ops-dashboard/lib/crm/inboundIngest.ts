import type { Pool, PoolClient } from "pg";

function normalizePhoneIdentity(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const plusPrefixed = t.startsWith("+");
  const digits = t.replace(/\D+/g, "");
  if (!digits) return "";
  return `${plusPrefixed ? "+" : ""}${digits}`.slice(0, 32);
}

export type InboundIngestInput = {
  clinic_id: number;
  from: string;
  text: string;
  messageId: string;
  dedupeHash: string;
  ruleIntent: string;
  rulePriority: number;
  ruleHandoff: boolean;
  fallbackReply: string;
  outsideHours: boolean;
  receivedAt: string;
  alertTo: string;
  workflowStartedAt?: number;
  /** Stored on inserted inbound rows (defaults to "n8n" for legacy callers). */
  messageSource?: string;
};

export type InboundIngestRow = {
  is_duplicate: boolean;
  clinic_id: number;
  patient_id: number;
  patient_status: string;
  /** Patient display name if set (may be null for new WhatsApp users). */
  patient_display_name: string | null;
  conversation_id: number;
  inbound_message_id: number;
  conversation_state: string;
  from: string;
  text: string;
  ruleIntent: string;
  rulePriority: number;
  ruleHandoff: boolean;
  fallbackReply: string;
  outsideHours: boolean;
  receivedAt: string;
  alertTo: string;
  dedupeHash: string;
  workflow_latency_ms: number;
};

export async function crmUpsertInbound(pool: Pool, input: InboundIngestInput): Promise<InboundIngestRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const row = await crmUpsertInboundCore(client, input);
      await client.query("COMMIT");
      return row;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  } finally {
    client.release();
  }
}

/**
 * Runs CRM upsert inside an existing transaction (caller manages BEGIN/COMMIT).
 * Does not commit or release the client.
 */
export async function crmUpsertInboundCore(client: PoolClient, p: InboundIngestInput): Promise<InboundIngestRow> {
  const workflowStartedAt = p.workflowStartedAt ?? Date.now();
  const clinicId = p.clinic_id;
  const chatId = p.from.trim();
  // Important: WhatsApp chat_id is not a real E.164 phone number.
  // We store the raw chat_id and derive WhatsApp digits in the UI/API when needed.
  const phoneIdentity = "";
  const messageId = (p.messageId || "").trim() || null;
  const messageSource = (p.messageSource || "n8n").slice(0, 64);

  const dedupeDup = await client.query(`SELECT id FROM messages WHERE clinic_id = $1 AND dedupe_hash = $2 LIMIT 1`, [
    clinicId,
    p.dedupeHash,
  ]);
  let duplicateMsgId: number | null = dedupeDup.rows[0] ? Number((dedupeDup.rows[0] as { id: unknown }).id) : null;
  if (duplicateMsgId == null && messageId && String(messageId).trim()) {
    const midDup = await client.query(`SELECT id FROM messages WHERE clinic_id = $1 AND message_id = $2 LIMIT 1`, [
      clinicId,
      String(messageId).trim(),
    ]);
    if (midDup.rows[0]) duplicateMsgId = Number((midDup.rows[0] as { id: unknown }).id);
  }
  const isDuplicate = duplicateMsgId != null;

  const pat = await client.query(
    `INSERT INTO patients (clinic_id, chat_id, phone_e164, status, first_seen_at, last_seen_at, updated_at)
     VALUES ($1, $2, $3, 'new', NOW(), NOW(), NOW())
     ON CONFLICT (clinic_id, chat_id) DO UPDATE SET
       last_seen_at = NOW(),
       updated_at = NOW(),
       phone_e164 = COALESCE(NULLIF(patients.phone_e164, ''), EXCLUDED.phone_e164)
     RETURNING id, status, display_name`,
    [clinicId, chatId, phoneIdentity || null],
  );
  const patientId = Number(pat.rows[0].id);
  const patientStatus = String(pat.rows[0].status);
  const patientDisplayName =
    pat.rows[0].display_name != null && String(pat.rows[0].display_name).trim()
      ? String(pat.rows[0].display_name).trim()
      : null;

  const activeConv = await client.query(
    `SELECT c.id, c.state
     FROM conversations c
     WHERE c.clinic_id = $1 AND c.patient_id = $2 AND c.status = 'open' AND c.deleted_at IS NULL
     ORDER BY c.id DESC
     LIMIT 1`,
    [clinicId, patientId],
  );

  let conversationId: number;
  let conversationState: string;

  if (activeConv.rows[0]) {
    conversationId = Number(activeConv.rows[0].id);
    conversationState = String(activeConv.rows[0].state);
  } else {
    const insConv = await client.query(
      `INSERT INTO conversations (clinic_id, patient_id, channel, status, state, opened_at, created_at, updated_at)
       VALUES ($1, $2, 'whatsapp', 'open', 'NEW', NOW(), NOW(), NOW())
       RETURNING id, state`,
      [clinicId, patientId],
    );
    conversationId = Number(insConv.rows[0].id);
    conversationState = String(insConv.rows[0].state);
  }

  let inboundMessageId: number;
  if (isDuplicate) {
    inboundMessageId = duplicateMsgId!;
  } else {
    const insMsg = await client.query(
      `INSERT INTO messages (
         clinic_id, conversation_id, patient_id, message_id, dedupe_hash, direction, text,
         intent, priority, is_urgent, dedup_skipped, source, payload, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'inbound', $6,
         $7, $8, $9, false, $10, '{}'::jsonb, NOW()
       ) RETURNING id`,
      [
        clinicId,
        conversationId,
        patientId,
        messageId,
        p.dedupeHash,
        p.text,
        p.ruleIntent,
        p.rulePriority,
        p.ruleIntent === "URGENT",
        messageSource,
      ],
    );
    inboundMessageId = Number(insMsg.rows[0].id);
  }

  const workflow_latency_ms = Date.now() - workflowStartedAt;

  return {
    is_duplicate: isDuplicate,
    clinic_id: clinicId,
    patient_id: patientId,
    patient_status: patientStatus,
    patient_display_name: patientDisplayName,
    conversation_id: conversationId,
    inbound_message_id: inboundMessageId,
    conversation_state: conversationState,
    from: chatId,
    text: p.text,
    ruleIntent: p.ruleIntent,
    rulePriority: p.rulePriority,
    ruleHandoff: p.ruleHandoff,
    fallbackReply: p.fallbackReply,
    outsideHours: p.outsideHours,
    receivedAt: p.receivedAt,
    alertTo: p.alertTo,
    dedupeHash: p.dedupeHash,
    workflow_latency_ms,
  };
}

/** @deprecated Prefer crmUpsertInboundCore inside a managed transaction. */
export async function crmUpsertInboundTx(client: PoolClient, p: InboundIngestInput): Promise<InboundIngestRow> {
  await client.query("BEGIN");
  try {
    const row = await crmUpsertInboundCore(client, p);
    await client.query("COMMIT");
    return row;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}
