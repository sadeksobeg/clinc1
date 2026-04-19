import type { Pool } from "pg";
import { getLastPatientInboundAt, isRecentPatientInbound } from "@/lib/whatsapp/replyWindow";
import type { ClaimedOutboxRow } from "./coreOutbox";
import { markOutboxBlocked } from "./coreOutbox";
import { opsLog } from "@/lib/opsLog";

const STAFF_KINDS = new Set(["urgent_alert"]);

const ALLOWED_PATIENT_KINDS = new Set(["patient_reply", "reminder", "late_check", "doctor_reschedule"]);

export async function resolvePatientIdForOutbox(pool: Pool, row: ClaimedOutboxRow): Promise<number | null> {
  const pid = row.payload.patient_id;
  if (typeof pid === "number" && Number.isFinite(pid)) return pid;
  if (row.conversation_id) {
    const r = await pool.query(`SELECT patient_id FROM conversations WHERE id = $1`, [row.conversation_id]);
    const p = r.rows[0]?.patient_id;
    return typeof p === "number" && Number.isFinite(p) ? p : null;
  }
  const to = String(row.payload.to || "").trim();
  if (!to) return null;
  const pr = await pool.query(`SELECT id FROM patients WHERE chat_id = $1 AND clinic_id = $2 LIMIT 1`, [
    to,
    row.clinic_id,
  ]);
  const id = pr.rows[0]?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/**
 * HARD DROP path: mark `blocked` and skip bridge. No defer, no coalesce.
 * Returns whether the worker may call `sendViaBridge` for this row.
 */
export async function evaluateOutboxRowForSend(pool: Pool, row: ClaimedOutboxRow): Promise<{ send: boolean }> {
  const kind = row.payload.kind;

  if (typeof kind === "string" && STAFF_KINDS.has(kind)) {
    return { send: true };
  }

  if (typeof kind === "string" && kind === "marketing") {
    await markOutboxBlocked(pool, row.id, "policy_blocked:marketing");
    opsLog("warn", "outbox_reply_gate", "blocked_marketing", { outbox_id: row.id });
    return { send: false };
  }

  if (typeof kind !== "string" || !ALLOWED_PATIENT_KINDS.has(kind)) {
    await markOutboxBlocked(pool, row.id, `policy_blocked:kind:${String(kind)}`);
    opsLog("warn", "outbox_reply_gate", "blocked_unknown_kind", { outbox_id: row.id, kind });
    return { send: false };
  }

  if (kind === "patient_reply") {
    const pid = row.payload.patient_id;
    const cid = row.payload.conversation_id;
    const li = row.payload.last_inbound_at;
    const okPid = typeof pid === "number" && Number.isFinite(pid);
    const okCid = typeof cid === "number" && Number.isFinite(cid);
    const okLi = typeof li === "string" && li.length >= 10;
    if (!okPid || !okCid || !okLi) {
      await markOutboxBlocked(pool, row.id, "policy_blocked:invalid_patient_reply_context");
      opsLog("warn", "outbox_reply_gate", "blocked_patient_reply_payload", { outbox_id: row.id });
      return { send: false };
    }
  }

  const patientId = await resolvePatientIdForOutbox(pool, row);
  if (patientId == null) {
    await markOutboxBlocked(pool, row.id, "policy_blocked:unresolved_patient");
    opsLog("warn", "outbox_reply_gate", "blocked_unresolved_patient", { outbox_id: row.id });
    return { send: false };
  }

  const lastAt = await getLastPatientInboundAt(pool, { clinicId: row.clinic_id, patientId });
  if (!isRecentPatientInbound(lastAt)) {
    await markOutboxBlocked(pool, row.id, "blocked_outside_reply_window");
    opsLog("warn", "outbox_reply_gate", "blocked_outside_reply_window", {
      outbox_id: row.id,
      kind,
      patient_id: patientId,
    });
    return { send: false };
  }

  return { send: true };
}
