import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getDefaultMessagingAdapter } from "@/lib/messaging/WhatsAppWebAdapter";
import { getLastPatientInboundAt } from "@/lib/whatsapp/replyWindow";
import { opsLogError } from "@/lib/opsLog";
import { hasIdempotentAudit, insertAuditLog } from "@/lib/auditTrail";
import { guardOutboundPatientText } from "@/lib/conversations/outboundMessageGuard";

const bodySchema = z.object({
  clinic_id: z.number().int().positive().default(1),
  text: z.string().min(1).max(4000),
  template_key: z.string().max(120).optional().nullable(),
  idempotency_key: z.string().max(200).optional().nullable(),
});

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  const startedAt = Date.now();
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  const convId = Number(ctx.params.id);
  if (!Number.isFinite(convId) || convId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
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

  const clinicId = parsed.data.clinic_id;
  const pool = getPool();
  try {
    const idempotencyKey = parsed.data.idempotency_key?.trim() || null;
    if (idempotencyKey) {
      const seen = await hasIdempotentAudit(pool, {
        clinicId,
        action: "conversation.reply",
        entityId: String(convId),
        idempotencyKey,
      });
      if (seen) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
    }

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

    const lastInbound = await getLastPatientInboundAt(pool, { clinicId, patientId: row.patient_id });
    const guarded = await guardOutboundPatientText({
      text: parsed.data.text,
      clinicId,
      conversationId: convId,
      source: "internal_conversation_reply",
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
      clinicId,
    });
    if (!bridgeRes.ok) {
      const st = bridgeRes.detail === "no_last_inbound" || bridgeRes.detail === "outside_reply_window" ? 403 : 502;
      return NextResponse.json({ ok: false, error: "Bridge send blocked or failed", detail: bridgeRes.detail }, { status: st });
    }

    await pool.query(
      `INSERT INTO messages (
         clinic_id, conversation_id, patient_id, direction, text, intent, priority, is_urgent, source, payload
       ) VALUES (
         $1, $2, $3, 'outbound', $4, $5, 3, false, 'apps_web',
         jsonb_build_object('template_key', $6::text, 'idempotency_key', $7::text)
       )`,
      [
        clinicId,
        convId,
        row.patient_id,
        outboundText,
        parsed.data.template_key ? "template_reply" : "human_reply",
        parsed.data.template_key ?? null,
        parsed.data.idempotency_key ?? null,
      ],
    );
    await pool.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [convId]);
    await insertAuditLog(pool, {
      clinicId,
      action: "conversation.reply",
      entityType: "conversation",
      entityId: String(convId),
      payload: {
        ok: true,
        template_key: parsed.data.template_key ?? null,
        idempotency_key: parsed.data.idempotency_key ?? null,
        duration_ms: Date.now() - startedAt,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    await insertAuditLog(pool, {
      clinicId,
      action: "conversation.reply",
      entityType: "conversation",
      entityId: String(convId),
      payload: { ok: false, duration_ms: Date.now() - startedAt },
    }).catch(() => undefined);
    opsLogError("internal/conversations/reply", e, { conversation_id: convId, clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
