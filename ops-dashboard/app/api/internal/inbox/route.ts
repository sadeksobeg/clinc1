import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import {
  conversationVisibleToClinicSql,
  ROUTED_CLINIC_ID_SELECT_SQL,
} from "@/lib/conversations/clinicVisibility";
import { opsLogError } from "@/lib/opsLog";

export const dynamic = "force-dynamic";

/**
 * Service-token inbox for BFF / automation (same query shape as /api/inbox for ops UI).
 * Query: clinic_id (default 1).
 */
export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  const url = new URL(req.url);
  const clinicId = Math.max(1, Number.parseInt(url.searchParams.get("clinic_id") || "1", 10) || 1);

  try {
    const pool = getPool();
    const visibleSql = conversationVisibleToClinicSql("$1");
    const r = await pool.query(
      `SELECT c.id AS conversation_id,
              c.clinic_id AS owner_clinic_id,
              ${ROUTED_CLINIC_ID_SELECT_SQL},
              c.state,
              c.handoff_reason,
              c.status,
              c.routing,
              COALESCE((c.routing->>'unread')::boolean, false) AS unread,
              p.id AS patient_id,
              p.chat_id,
              p.display_name,
              p.is_vip,
              p.is_blacklisted,
              lm.text AS last_message,
              lm.created_at AS last_message_at,
              li.intent AS last_inbound_intent,
              COALESCE(li.is_urgent, false) AS last_inbound_is_urgent,
              c.routing->'last_decision'->>'type' AS last_decision_type,
              c.routing->'last_decision'->>'reason' AS last_decision_reason,
              c.routing->'last_decision'->>'primary_medical_reason' AS last_decision_primary_medical_reason,
              CASE
                WHEN (c.routing->'last_decision'->>'severity') ~ '^[0-9]+$'
                THEN (c.routing->'last_decision'->>'severity')::int
                ELSE NULL
              END AS last_inbound_severity,
              CASE
                WHEN (c.routing->'last_decision'->>'confidence') ~ '^[0-9]*\\.?[0-9]+$'
                THEN (c.routing->'last_decision'->>'confidence')::double precision
                ELSE NULL
              END AS last_inbound_confidence
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       LEFT JOIN LATERAL (
         SELECT m.text, m.created_at
         FROM messages m
         WHERE m.conversation_id = c.id AND m.clinic_id = c.clinic_id
         ORDER BY m.created_at DESC
         LIMIT 1
       ) lm ON TRUE
       LEFT JOIN LATERAL (
         SELECT m.text, m.created_at, m.intent, m.is_urgent
         FROM messages m
         WHERE m.conversation_id = c.id
           AND m.clinic_id = c.clinic_id
           AND m.direction = 'inbound'
         ORDER BY m.created_at DESC
         LIMIT 1
       ) li ON TRUE
       WHERE ${visibleSql}
         AND c.deleted_at IS NULL
         AND c.status = 'open'
       ORDER BY lm.created_at DESC NULLS LAST, c.updated_at DESC
       LIMIT 200`,
      [clinicId],
    );

    return NextResponse.json({ ok: true, rows: r.rows });
  } catch (e) {
    opsLogError("internal/inbox", e, { clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
