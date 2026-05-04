import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { regenerateSuggestedCreateAppointment } from "@/lib/ai/decisionPolicy";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";

const bodySchema = z.object({
  clinic_id: z.number().int().positive().default(1),
  conversation_id: z.number().int().positive(),
});

type RoutingDecision = {
  type?: string;
};

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

  try {
    const pool = getPool();
    const convR = await pool.query(
      `SELECT id, clinic_id, routing
       FROM conversations
       WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [body.conversation_id, body.clinic_id],
    );
    const conv = convR.rows[0] as
      | {
          id: number;
          clinic_id: number;
          routing: Record<string, unknown> | null;
        }
      | undefined;
    if (!conv) {
      return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
    }

    const routing = (conv.routing ?? {}) as Record<string, unknown>;
    const lastDecision = ((routing.last_decision ?? {}) as RoutingDecision) || {};
    const decisionType = String(lastDecision.type || "").toUpperCase();
    const reason = decisionType === "EMERGENCY" ? "urgent" : "booking";
    const sourceChannel = decisionType === "EMERGENCY" ? "whatsapp_emergency" : "whatsapp_guided_booking";

    const action = await regenerateSuggestedCreateAppointment({
      pool,
      clinicId: conv.clinic_id,
      conversationId: conv.id,
      reason,
      sourceChannel,
    });
    if (!action) {
      return NextResponse.json({ ok: false, error: "no_available_slots" }, { status: 409 });
    }

    await pool.query(
      `UPDATE conversations
       SET routing = COALESCE(routing, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3`,
      [JSON.stringify({ suggested_actions: [action] }), conv.id, conv.clinic_id],
    );

    return NextResponse.json({ ok: true, action });
  } catch (e) {
    opsLogError("internal/decision/regenerate", e, {
      conversation_id: body.conversation_id,
      clinic_id: body.clinic_id,
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
