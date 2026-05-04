import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";
import { insertAuditLog } from "@/lib/auditTrail";

const patchSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  timezone: z.string().min(2).max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  holidays: z.array(z.string().min(8).max(32)).optional(),
  working_hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        is_closed: z.boolean(),
        opens_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
        closes_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
      }),
    )
    .optional(),
});

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, slug, name, timezone, metadata
       FROM clinics
       WHERE id = $1 AND deleted_at IS NULL`,
      [clinicId],
    );
    if (!r.rows[0]) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const hours = await pool.query(
      `SELECT weekday, is_closed, opens_at::text AS opens_at, closes_at::text AS closes_at
       FROM clinic_public_hours
       WHERE clinic_id = $1
       ORDER BY weekday ASC`,
      [clinicId],
    );
    return NextResponse.json({ ok: true, clinic: r.rows[0], working_hours: hours.rows });
  } catch (e) {
    opsLogError("internal/clinics/settings:get", e, { clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const startedAt = Date.now();
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (parsed.data.working_hours) {
        await client.query(`DELETE FROM clinic_public_hours WHERE clinic_id = $1`, [clinicId]);
        for (const row of parsed.data.working_hours) {
          await client.query(
            `INSERT INTO clinic_public_hours (clinic_id, weekday, is_closed, opens_at, closes_at, updated_at)
             VALUES ($1, $2, $3, $4::time, $5::time, NOW())`,
            [clinicId, row.weekday, row.is_closed, row.opens_at ?? null, row.closes_at ?? null],
          );
        }
      }

      const metadataPatch: Record<string, unknown> = { ...(parsed.data.metadata ?? {}) };
      if (parsed.data.holidays) metadataPatch.holidays = parsed.data.holidays;

      const metadataJson = Object.keys(metadataPatch).length ? JSON.stringify(metadataPatch) : null;
      const r = await client.query(
        `UPDATE clinics
         SET name = COALESCE($1::text, name),
             timezone = COALESCE($2::text, timezone),
             metadata = CASE
               WHEN $3::jsonb IS NULL THEN metadata
               ELSE COALESCE(metadata, '{}'::jsonb) || $3::jsonb
             END,
             updated_at = NOW()
         WHERE id = $4 AND deleted_at IS NULL
         RETURNING id, slug, name, timezone, metadata`,
        [parsed.data.name ?? null, parsed.data.timezone ?? null, metadataJson, clinicId],
      );
      if (!r.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      await client.query("COMMIT");

      const hours = await pool.query(
        `SELECT weekday, is_closed, opens_at::text AS opens_at, closes_at::text AS closes_at
         FROM clinic_public_hours
         WHERE clinic_id = $1
         ORDER BY weekday ASC`,
        [clinicId],
      );
      await insertAuditLog(pool, {
        clinicId,
        action: "clinic.settings.patch",
        entityType: "clinic",
        entityId: String(clinicId),
        payload: {
          ok: true,
          updated_name: parsed.data.name ?? null,
          updated_timezone: parsed.data.timezone ?? null,
          holidays_count: parsed.data.holidays?.length ?? null,
          working_hours_updated: Array.isArray(parsed.data.working_hours),
          duration_ms: Date.now() - startedAt,
        },
      });
      return NextResponse.json({ ok: true, clinic: r.rows[0], working_hours: hours.rows });
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    } finally {
      client.release();
    }
  } catch (e) {
    await insertAuditLog(getPool(), {
      clinicId,
      action: "clinic.settings.patch",
      entityType: "clinic",
      entityId: String(clinicId),
      payload: { ok: false, duration_ms: Date.now() - startedAt },
    }).catch(() => undefined);
    opsLogError("internal/clinics/settings:patch", e, { clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
