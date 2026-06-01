/** Pause / resume / rotate WhatsApp outbound. Each toggle is system-wide. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { platformGuard } from "@/lib/platform/platformAuth";
import { getRuntimeFlag, setRuntimeFlag } from "@/lib/system/emergencyMode";
import { writeStructuredLog } from "@/lib/observability/trace";

const schema = z
  .object({
    action: z.enum(["pause_all_outbound", "resume_all_outbound", "pause_number", "resume_number", "rotate_to_backup"]),
    to_number: z.string().min(6).max(32).optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();

export async function GET(req: Request) {
  const g = await platformGuard(req, "whatsapp.health.read");
  if (!g.ok) return g.res;
  const pool = getPool();
  const [waDisabled, numbers] = await Promise.all([
    getRuntimeFlag("whatsapp_send_disabled", { pool }),
    pool
      .query(
        `SELECT to_number, paired_at, last_connected_at, last_disconnected_at,
                is_paused, paused_reason, paused_at
           FROM wa_number_state
          ORDER BY id ASC`,
      )
      .catch(() => ({ rows: [] })),
  ]);
  return NextResponse.json({
    ok: true,
    whatsapp_send_disabled: Boolean(waDisabled),
    numbers: numbers.rows,
  });
}

export async function POST(req: Request) {
  const g = await platformGuard(req, "whatsapp.runtime.write");
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const pool = getPool();
  const requestId = req.headers.get("x-request-id")?.trim() || null;

  if (v.action === "pause_all_outbound" || v.action === "resume_all_outbound") {
    await setRuntimeFlag({
      pool,
      clinicId: null,
      actorUserId: String(g.actor || ""),
      flagKey: "whatsapp_send_disabled",
      enabled: v.action === "pause_all_outbound",
      reason: v.reason,
      requestId,
    });
  } else if (v.action === "pause_number" || v.action === "resume_number") {
    if (!v.to_number) {
      return NextResponse.json({ ok: false, error: "to_number_required" }, { status: 400 });
    }
    const pause = v.action === "pause_number";
    await pool.query(
      `INSERT INTO wa_number_state (to_number, is_paused, paused_reason, paused_at)
         VALUES ($1, $2, $3, CASE WHEN $2 THEN NOW() ELSE NULL END)
       ON CONFLICT (to_number) DO UPDATE
         SET is_paused = EXCLUDED.is_paused,
             paused_reason = EXCLUDED.paused_reason,
             paused_at = EXCLUDED.paused_at,
             updated_at = NOW()`,
      [v.to_number, pause, pause ? v.reason : null],
    );
  } else if (v.action === "rotate_to_backup") {
    if (!v.to_number) {
      return NextResponse.json({ ok: false, error: "to_number_required" }, { status: 400 });
    }
    // Mark the active route as inactive so a backup route (separate row in
    // whatsapp_inbound_routes) takes over inbound. Admins must have provisioned
    // the backup row in advance (see WHATSAPP_ROUTING_RUNBOOK_AR.md).
    await pool.query(
      `UPDATE whatsapp_inbound_routes SET is_active = FALSE, updated_at = NOW() WHERE to_number = $1`,
      [v.to_number],
    );
  }

  await writeStructuredLog({
    level: "warn",
    eventName: "platform.whatsapp.runtime.control",
    requestId,
    userId: g.actor,
    message: `WhatsApp runtime control: ${v.action}`,
    payload: { action: v.action, to_number: v.to_number || null, reason: v.reason },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
