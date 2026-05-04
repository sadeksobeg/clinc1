import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getWhatsAppSafetySnapshot } from "@/lib/whatsapp/whatsappSafetyLayer";
import { getRuntimeFlag } from "@/lib/system/emergencyMode";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const started = Date.now();
  try {
    const pool = getPool();
    const ping = await pool.query("SELECT 1 AS ok");
    const latencyMs = Date.now() - started;
    const [waDisabled, waSnap] = await Promise.all([
      getRuntimeFlag("whatsapp_send_disabled", { pool }),
      Promise.resolve(getWhatsAppSafetySnapshot()),
    ]);
    return NextResponse.json({
      ok: true,
      health: {
        db_ok: Boolean(ping.rows[0]?.ok),
        db_latency_ms: latencyMs,
        whatsapp_send_runtime_disabled: waDisabled,
        whatsapp_safety: waSnap,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "health_failed" }, { status: 500 });
  }
}
