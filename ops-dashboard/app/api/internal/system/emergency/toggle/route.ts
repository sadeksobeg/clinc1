import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getPool } from "@/lib/db";
import { readEmergencyModeSnapshot, setEmergencyMode, setRuntimeFlag } from "@/lib/system/emergencyMode";
import { writeStructuredLog } from "@/lib/observability/trace";

const toggleSchema = z.object({
  mode: z.enum(["single", "emergency_mode"]),
  reason: z.string().min(5).max(500),
  flag_key: z.enum(["whatsapp_send_disabled", "ai_autoreply_disabled", "auto_booking_disabled", "emergency_global_disable"]).optional(),
  enabled: z.boolean(),
});

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const actorUserId = String(req.headers.get("x-user-id") || "").trim();
  if (!actorUserId) {
    return NextResponse.json({ ok: false, error: "missing_actor_user_id" }, { status: 400 });
  }
  const clinicIdRaw = Number(req.headers.get("x-clinic-id") || 0);
  const clinicId = Number.isFinite(clinicIdRaw) && clinicIdRaw > 0 ? clinicIdRaw : null;
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  const platformScope = req.headers.get("x-platform-scope") === "true";

  const pool = getPool();
  if (data.mode === "emergency_mode") {
    await setEmergencyMode({
      pool,
      clinicId,
      actorUserId,
      enabled: data.enabled,
      reason: data.reason,
      requestId,
    });
  } else {
    if (!data.flag_key) {
      return NextResponse.json({ ok: false, error: "flag_key_required" }, { status: 400 });
    }
    await setRuntimeFlag({
      pool,
      clinicId,
      actorUserId,
      flagKey: data.flag_key,
      enabled: data.enabled,
      reason: data.reason,
      requestId,
    });
  }

  if (platformScope) {
    await writeStructuredLog({
      level: "warn",
      eventName: "platform.action.executed",
      requestId,
      clinicId,
      userId: Number(actorUserId) || null,
      message: "Platform scoped emergency action",
      payload: {
        mode: data.mode,
        enabled: data.enabled,
        flag_key: data.flag_key ?? null,
        target_clinic_id: clinicId,
        platform_scope: true,
      },
    });
  }

  const snapshot = await readEmergencyModeSnapshot(pool);
  return NextResponse.json({
    ok: true,
    emergency: {
      emergency_mode: snapshot.emergency_mode,
      whatsapp_send_disabled: snapshot.whatsapp_send_disabled,
      ai_autoreply_disabled: snapshot.ai_autoreply_disabled,
      auto_booking_disabled: snapshot.auto_booking_disabled,
      emergency_global_disable: snapshot.emergency_global_disable,
      rows: snapshot.rows,
    },
  });
}

