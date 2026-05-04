import { NextResponse } from "next/server";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getPool } from "@/lib/db";
import { readEmergencyModeSnapshot, readLatestEmergencySnapshot } from "@/lib/system/emergencyMode";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const pool = getPool();
  const [snapshot, latestSnapshot] = await Promise.all([readEmergencyModeSnapshot(pool), readLatestEmergencySnapshot(pool)]);
  return NextResponse.json({
    ok: true,
    emergency: {
      emergency_mode: snapshot.emergency_mode,
      whatsapp_send_disabled: snapshot.whatsapp_send_disabled,
      ai_autoreply_disabled: snapshot.ai_autoreply_disabled,
      auto_booking_disabled: snapshot.auto_booking_disabled,
      emergency_global_disable: snapshot.emergency_global_disable,
      updated_at: snapshot.rows.reduce<string | null>((acc, row) => (row.updated_at > (acc || "") ? row.updated_at : acc), null),
      rows: snapshot.rows,
      latest_snapshot: latestSnapshot,
    },
  });
}

