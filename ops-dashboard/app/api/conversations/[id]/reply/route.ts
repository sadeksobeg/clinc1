import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getDefaultMessagingAdapter } from "@/lib/messaging/WhatsAppWebAdapter";
import { getCorrelationIdFromRequest } from "@/lib/observability/correlation";
import { getSession } from "@/lib/session";
import { getLastPatientInboundAt } from "@/lib/whatsapp/replyWindow";
import { guardOutboundPatientText } from "@/lib/conversations/outboundMessageGuard";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.sub || session.clinicId == null) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "viewer") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const clinicId = Number(session.clinicId);
  const { id } = ctx.params;
  const convId = Number(id);
  if (!Number.isFinite(convId)) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }

  const pool = getPool();
  const conv = await pool.query(
    `SELECT c.id, p.id AS patient_id, p.chat_id
     FROM conversations c
     JOIN patients p ON p.id = c.patient_id
     WHERE c.id = $1 AND c.clinic_id = $2 AND c.deleted_at IS NULL`,
    [convId, clinicId],
  );
  const row = conv.rows[0] as { id: number; patient_id: number; chat_id: string } | undefined;
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const correlationId = getCorrelationIdFromRequest(req);
  const lastInbound = await getLastPatientInboundAt(pool, { clinicId, patientId: row.patient_id });
  const guarded = await guardOutboundPatientText({
    text: parsed.data.text,
    clinicId,
    conversationId: convId,
    source: "ops_dashboard_conversation_reply",
  });
  if (guarded.action === "block") {
    return NextResponse.json(
      { ok: false, error: "Outbound blocked by safety guard", detail: guarded.reason },
      { status: 400 },
    );
  }
  const outboundText = guarded.action === "sanitize" ? guarded.text : guarded.text;
  const bridgeRes = await getDefaultMessagingAdapter().send({
    to: row.chat_id,
    text: outboundText,
    policy: { kind: "patient_proactive", lastInboundAt: lastInbound },
    correlationId,
    clinicId,
  });
  if (!bridgeRes.ok) {
    const st = bridgeRes.detail === "no_last_inbound" || bridgeRes.detail === "outside_reply_window" ? 403 : 502;
    return NextResponse.json({ ok: false, error: "Bridge send blocked or failed", detail: bridgeRes.detail }, { status: st });
  }

  await pool.query(
    `INSERT INTO messages (
       clinic_id, conversation_id, patient_id, direction, text, intent, priority, is_urgent, source, payload
     ) VALUES ($1, $2, $3, 'outbound', $4, 'human_reply', 3, false, 'ops_dashboard', '{}'::jsonb)`,
    [clinicId, convId, row.patient_id, outboundText],
  );

  await pool.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [convId]);

  return NextResponse.json({ ok: true });
}
