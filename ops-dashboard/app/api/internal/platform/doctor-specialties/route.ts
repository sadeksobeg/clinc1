/** Doctor × Specialty (M:N) admin API. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { platformGuard } from "@/lib/platform/platformAuth";

const upsertSchema = z
  .object({
    doctor_id: z.number().int().positive(),
    specialty_ids: z.array(z.number().int().positive()).min(0).max(20),
    primary_specialty_id: z.number().int().positive().nullable().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const g = await platformGuard(req, "doctors.read");
  if (!g.ok) return g.res;
  const url = new URL(req.url);
  const doctorId = Number(url.searchParams.get("doctor_id"));
  const pool = getPool();
  if (Number.isFinite(doctorId) && doctorId > 0) {
    const r = await pool.query(
      `SELECT ds.specialty_id, ds.is_primary, s.code, s.label_ar
         FROM doctor_specialties ds
         JOIN specialties s ON s.id = ds.specialty_id
        WHERE ds.doctor_id = $1
        ORDER BY ds.is_primary DESC, s.sort_order ASC`,
      [doctorId],
    );
    return NextResponse.json({ ok: true, doctor_id: doctorId, rows: r.rows });
  }
  const r = await pool.query(
    `SELECT d.id AS doctor_id, d.display_name, d.clinic_id, d.specialty AS legacy_specialty,
            COALESCE(json_agg(json_build_object(
              'specialty_id', ds.specialty_id,
              'code', s.code,
              'label_ar', s.label_ar,
              'is_primary', ds.is_primary
            )) FILTER (WHERE ds.specialty_id IS NOT NULL), '[]'::json) AS specialties
       FROM doctors d
       LEFT JOIN doctor_specialties ds ON ds.doctor_id = d.id
       LEFT JOIN specialties s ON s.id = ds.specialty_id
      WHERE d.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY d.clinic_id ASC, d.id ASC`,
  );
  return NextResponse.json({ ok: true, doctors: r.rows });
}

export async function POST(req: Request) {
  const g = await platformGuard(req, "doctors.write");
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const pool = getPool();
  const v = parsed.data;
  const primary = v.primary_specialty_id ?? v.specialty_ids[0] ?? null;
  // Replace the entire (doctor → specialties) set in a single tx.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM doctor_specialties WHERE doctor_id = $1`, [v.doctor_id]);
    if (v.specialty_ids.length > 0) {
      for (const sid of v.specialty_ids) {
        await client.query(
          `INSERT INTO doctor_specialties (doctor_id, specialty_id, is_primary)
             VALUES ($1, $2, $3)
           ON CONFLICT (doctor_id, specialty_id) DO NOTHING`,
          [v.doctor_id, sid, primary === sid],
        );
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { ok: false, error: "update_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
  return NextResponse.json({ ok: true });
}
