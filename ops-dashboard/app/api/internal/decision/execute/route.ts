import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { enqueueCoreOutbox } from "@/lib/outbox/coreOutbox";
import { validateDecisionExecution } from "@/lib/ai/decisionPolicy";
import { confirmAppointment } from "@/lib/scheduling/appointmentService";
import { sendPatientWhatsAppGuarded } from "@/lib/whatsapp/patientOutbound";

type SuggestedAction = {
  id: string;
  type: "CREATE_APPOINTMENT";
  status?: "pending" | "executed" | "rejected";
  reason?: string;
  created_at?: string;
  payload?: {
    suggested_time?: string;
    doctor_id?: number;
    doctor_name?: string;
    source_channel?: string;
  };
};

const bodySchema = z.object({
  clinic_id: z.number().int().positive().default(1),
  conversation_id: z.number().int().positive(),
  action_id: z.string().min(3).max(200),
  decision: z.enum(["confirm", "reject"]),
});

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const body = parsed.data;
  incProductMetric("decision_execute_total");

  try {
    const pool = getPool();
    const convR = await pool.query(
      `SELECT c.id, c.clinic_id, c.patient_id, c.routing, p.chat_id
       FROM conversations c
       JOIN patients p ON p.id = c.patient_id
       WHERE c.id = $1 AND c.clinic_id = $2 AND c.deleted_at IS NULL`,
      [body.conversation_id, body.clinic_id],
    );
    const conv = convR.rows[0] as
      | {
          id: number;
          clinic_id: number;
          patient_id: number;
          routing: Record<string, unknown> | null;
          chat_id: string;
        }
      | undefined;
    if (!conv) {
      incProductMetric("decision_execute_error_total");
      return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
    }

    const routing = (conv.routing ?? {}) as Record<string, unknown>;
    const list = Array.isArray(routing.suggested_actions) ? (routing.suggested_actions as SuggestedAction[]) : [];
    const idx = list.findIndex((x) => x?.id === body.action_id);
    if (idx < 0) {
      incProductMetric("decision_execute_error_total");
      return NextResponse.json({ ok: false, error: "suggested_action_not_found" }, { status: 404 });
    }

    const action = list[idx];
    if (action.status === "executed") {
      return NextResponse.json({ ok: true, duplicate: true, status: "executed" });
    }
    if (action.status === "rejected") {
      return NextResponse.json({ ok: false, error: "already_rejected" }, { status: 409 });
    }

    if (body.decision === "reject") {
      const rejected = markActionStatus(list, body.action_id, "rejected");
      const execution = {
        action_id: body.action_id,
        action_type: action.type,
        decision: "reject",
        status: "rejected",
        ts: new Date().toISOString(),
      };
      await pool.query(
        `UPDATE conversations
         SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2 AND clinic_id = $3`,
        [JSON.stringify({ suggested_actions: rejected, last_decision_execution: execution }), conv.id, conv.clinic_id],
      );
      incProductMetric("decision_execute_success_total");
      return NextResponse.json({ ok: true, status: "rejected", action_id: body.action_id });
    }

    if (action.type !== "CREATE_APPOINTMENT") {
      incProductMetric("decision_execute_error_total");
      return NextResponse.json({ ok: false, error: "unsupported_action_type" }, { status: 400 });
    }

    const validation = await validateDecisionExecution(
      {
        pool,
        clinicId: conv.clinic_id,
        patientId: conv.patient_id,
        conversationId: conv.id,
      },
      {
        id: action.id,
        type: action.type,
        created_at: action.created_at,
        payload: {
          suggested_time: action.payload?.suggested_time,
          doctor_id: action.payload?.doctor_id,
        },
      },
    );
    if (!validation.valid) {
      const execution = {
        action_id: body.action_id,
        action_type: action.type,
        decision: "confirm",
        status: "blocked",
        reason: validation.errors,
        ts: new Date().toISOString(),
      };
      await pool.query(
        `UPDATE conversations
         SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2 AND clinic_id = $3`,
        [JSON.stringify({ last_decision_execution: execution }), conv.id, conv.clinic_id],
      );
      incProductMetric("decision_execute_error_total");
      incProductMetric("decision_execute_blocked_total");
      return NextResponse.json(
        {
          ok: false,
          status: "blocked",
          reason: validation.errors,
          error: "decision_blocked",
        },
        { status: 409 },
      );
    }

    const suggestedAt = action.payload?.suggested_time;
    const doctorId = action.payload?.doctor_id;
    if (!suggestedAt || !doctorId) {
      incProductMetric("decision_execute_error_total");
      return NextResponse.json({ ok: false, error: "invalid_action_payload" }, { status: 400 });
    }

    const secondValidation = await validateDecisionExecution(
      {
        pool,
        clinicId: conv.clinic_id,
        patientId: conv.patient_id,
        conversationId: conv.id,
      },
      {
        id: action.id,
        type: action.type,
        created_at: action.created_at,
        payload: {
          suggested_time: suggestedAt,
          doctor_id: Number(doctorId),
        },
      },
    );
    if (!secondValidation.valid) {
      incProductMetric("decision_execute_error_total");
      incProductMetric("decision_execute_blocked_total");
      return NextResponse.json(
        { ok: false, status: "blocked", reason: secondValidation.errors, error: "decision_blocked_recheck" },
        { status: 409 },
      );
    }

    const idem = `decision_execute:${conv.id}:${body.action_id}`;
    const booked = await confirmAppointment(pool, {
      clinicId: conv.clinic_id,
      patientId: conv.patient_id,
      doctorId: Number(doctorId),
      startsAtIso: suggestedAt,
      conversationId: conv.id,
      idempotencyKey: idem,
      sourceChannel: action.payload?.source_channel || "whatsapp_guided_execution",
    });
    if (!booked.ok) {
      incProductMetric("decision_execute_error_total");
      return NextResponse.json({ ok: false, error: booked.error, code: booked.code }, { status: booked.code === "overlap" ? 409 : 400 });
    }

    const apptLabel = await formatAppointmentLabel(pool, conv.clinic_id, suggestedAt);
    const confirmText = `تم تأكيد موعدك بتاريخ ${apptLabel}. إذا أردت تعديل الوقت أرسل لنا رسالة.`.slice(0, 1000);
    const sr = await sendPatientWhatsAppGuarded({
      to: conv.chat_id,
      text: confirmText,
      context: "inbound_sync_reply",
      correlationId: `decision-exec-${conv.id}-${body.action_id}`,
      clinicId: conv.clinic_id,
      conversationId: conv.id,
    });
    let queued_outbox_id: number | null = null;
    if (!sr.ok) {
      queued_outbox_id = await enqueueCoreOutbox(pool, {
        clinic_id: conv.clinic_id,
        conversation_id: conv.id,
        job_type: "whatsapp_send",
        payload: {
          to: conv.chat_id,
          text: confirmText,
          kind: "patient_reply",
          patient_id: conv.patient_id,
          conversation_id: conv.id,
          last_inbound_at: new Date().toISOString(),
        },
      });
    }

    const executed = markActionStatus(list, body.action_id, "executed");
    const execution = {
      action_id: body.action_id,
      action_type: action.type,
      decision: "confirm",
      status: "executed",
      appointment_id: booked.appointment_id,
      duplicate_booking: booked.duplicate ?? false,
      bridge_send_ok: sr.ok,
      bridge_send_error: sr.ok ? null : sr.detail,
      queued_outbox_id,
      ts: new Date().toISOString(),
    };
    await pool.query(
      `UPDATE conversations
       SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3`,
      [JSON.stringify({ suggested_actions: executed, last_decision_execution: execution }), conv.id, conv.clinic_id],
    );

    incProductMetric("decision_execute_success_total");
    return NextResponse.json({
      ok: true,
      status: "executed",
      action_id: body.action_id,
      appointment_id: booked.appointment_id,
      duplicate: booked.duplicate ?? false,
      bridge_send_ok: sr.ok,
      bridge_send_error: sr.ok ? null : sr.detail,
      queued_outbox_id,
    });
  } catch (e) {
    incProductMetric("decision_execute_error_total");
    opsLogError("internal/decision/execute", e, {
      conversation_id: body.conversation_id,
      clinic_id: body.clinic_id,
      action_id: body.action_id,
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

function markActionStatus(
  actions: SuggestedAction[],
  actionId: string,
  status: "executed" | "rejected",
): SuggestedAction[] {
  return actions.map((a) => (a.id === actionId ? { ...a, status } : a));
}

async function formatAppointmentLabel(pool: ReturnType<typeof getPool>, clinicId: number, startsAtIso: string): Promise<string> {
  const r = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [clinicId]);
  const zone = (r.rows[0]?.timezone as string) || "Asia/Amman";
  const local = DateTime.fromISO(startsAtIso, { zone: "utc" }).setZone(zone);
  return local.isValid ? local.toFormat("yyyy-LL-dd HH:mm") : startsAtIso;
}
