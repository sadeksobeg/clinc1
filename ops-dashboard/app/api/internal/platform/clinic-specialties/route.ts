/** Clinic × Specialty toggle matrix admin API. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { platformGuard } from "@/lib/platform/platformAuth";

const toggleSchema = z
  .object({
    clinic_id: z.number().int().positive(),
    specialty_id: z.number().int().positive(),
    is_active: z.boolean(),
  })
  .strict();

export async function GET(req: Request) {
  const g = await platformGuard(req, "clinic.services.read");
  if (!g.ok) return g.res;
  const url = new URL(req.url);
  const clinicId = Number(url.searchParams.get("clinic_id"));
  const pool = getPool();
  if (Number.isFinite(clinicId) && clinicId > 0) {
    const r = await pool.query(
      `SELECT cs.specialty_id, cs.is_active, s.code, s.label_ar, s.sort_order
         FROM clinic_specialties cs
         JOIN specialties s ON s.id = cs.specialty_id
        WHERE cs.clinic_id = $1
        ORDER BY s.sort_order ASC, s.id ASC`,
      [clinicId],
    );
    return NextResponse.json({ ok: true, clinic_id: clinicId, rows: r.rows });
  }
  // Full matrix (used to render the admin grid)
  const r = await pool.query(
    `SELECT cs.clinic_id, cs.specialty_id, cs.is_active
       FROM clinic_specialties cs
      ORDER BY cs.clinic_id ASC, cs.specialty_id ASC`,
  );
  return NextResponse.json({ ok: true, rows: r.rows });
}

export async function POST(req: Request) {
  const g = await platformGuard(req, "clinic.services.write");
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const pool = getPool();
  await pool.query(
    `INSERT INTO clinic_specialties (clinic_id, specialty_id, is_active)
       VALUES ($1, $2, $3)
     ON CONFLICT (clinic_id, specialty_id)
       DO UPDATE SET is_active = EXCLUDED.is_active`,
    [parsed.data.clinic_id, parsed.data.specialty_id, parsed.data.is_active],
  );
  return NextResponse.json({ ok: true });
}
