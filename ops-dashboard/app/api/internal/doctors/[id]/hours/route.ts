import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { opsLogError } from "@/lib/opsLog";

type Ctx = { params: { id: string } };

const hoursSchema = z
  .object({
    hours: z.array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        is_closed: z.boolean(),
        opens_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
        closes_at: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
      }),
    ),
  })
  .strict();

export async function GET(req: Request, ctx: Ctx) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const doctorId = Number(ctx.params.id);
  if (!Number.isFinite(doctorId) || doctorId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT weekday, opens_at::text AS opens_at, closes_at::text AS closes_at
       FROM doctor_working_hours
       WHERE doctor_id=$1
       ORDER BY weekday ASC`,
      [doctorId],
    );
    const rows = (r.rows ?? []).map((x: any) => ({
      weekday: Number(x.weekday),
      is_closed: false,
      opens_at: x.opens_at ? String(x.opens_at).slice(0, 5) : null,
      closes_at: x.closes_at ? String(x.closes_at).slice(0, 5) : null,
    }));
    return NextResponse.json({ ok: true, doctor_id: doctorId, hours: rows });
  } catch (e) {
    opsLogError("internal/doctors/hours:get", e, { doctor_id: doctorId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const doctorId = Number(ctx.params.id);
  if (!Number.isFinite(doctorId) || doctorId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = hoursSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM doctor_working_hours WHERE doctor_id=$1`, [doctorId]);
      for (const row of parsed.data.hours) {
        if (row.is_closed) continue;
        const opens = row.opens_at ? String(row.opens_at) : "09:00:00";
        const closes = row.closes_at ? String(row.closes_at) : "21:00:00";
        await client.query(
          `INSERT INTO doctor_working_hours (doctor_id, weekday, opens_at, closes_at, updated_at)
           VALUES ($1, $2, $3::time, $4::time, NOW())
           ON CONFLICT (doctor_id, weekday) DO UPDATE
             SET opens_at=EXCLUDED.opens_at, closes_at=EXCLUDED.closes_at, updated_at=NOW()`,
          [doctorId, row.weekday, opens, closes],
        );
      }
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
    return await GET(req, ctx);
  } catch (e) {
    opsLogError("internal/doctors/hours:patch", e, { doctor_id: doctorId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

