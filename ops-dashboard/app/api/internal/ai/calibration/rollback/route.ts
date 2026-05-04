import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";
import { incProductMetric } from "@/lib/observability/productMetrics";

const bodySchema = z.object({
  clinic_id: z.number().int().positive().default(1),
  actor_user_id: z.string().min(2).max(120).optional(),
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
  const pool = getPool();
  const clinicR = await pool.query(`SELECT metadata FROM clinics WHERE id = $1 AND deleted_at IS NULL`, [body.clinic_id]);
  if (!clinicR.rows[0]) {
    return NextResponse.json({ ok: false, error: "clinic_not_found" }, { status: 404 });
  }

  const metadata = (clinicR.rows[0].metadata ?? {}) as Record<string, unknown>;
  const aiCalibration = (metadata.ai_calibration ?? {}) as Record<string, unknown>;
  const lastSafe = aiCalibration.last_safe;
  if (!lastSafe || typeof lastSafe !== "object") {
    return NextResponse.json({ ok: false, error: "last_safe_not_found" }, { status: 400 });
  }

  const next = {
    ...(aiCalibration ?? {}),
    current: lastSafe,
    suggested: null,
    watch_until: null,
    last_action: "rolled_back",
    last_updated: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE clinics
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify({ ai_calibration: next }), body.clinic_id],
  );
  incProductMetric("calibration_rollback_total");
  await insertAuditLog(pool, {
    clinicId: body.clinic_id,
    action: "ai.calibration.rollback",
    entityType: "clinic",
    entityId: String(body.clinic_id),
    payload: {
      actor_user_id: body.actor_user_id ?? "ops_staff",
      restored_current: lastSafe,
    },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, ai_calibration: next });
}
