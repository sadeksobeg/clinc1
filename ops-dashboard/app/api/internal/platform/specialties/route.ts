/** Specialty catalog admin API. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { platformGuard } from "@/lib/platform/platformAuth";

const upsertSchema = z
  .object({
    id: z.number().int().positive().optional(),
    code: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/),
    label_ar: z.string().min(1).max(120),
    label_en: z.string().max(120).nullable().optional(),
    icon: z.string().max(120).nullable().optional(),
    sort_order: z.number().int().min(0).max(10_000).default(100),
    is_active: z.boolean().default(true),
  })
  .strict();

export async function GET(req: Request) {
  const g = await platformGuard(req, "specialties.read");
  if (!g.ok) return g.res;
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, code, label_ar, label_en, icon, sort_order, is_active,
            created_at, updated_at
       FROM specialties
       ORDER BY sort_order ASC, id ASC`,
  );
  return NextResponse.json({ ok: true, specialties: r.rows });
}

export async function POST(req: Request) {
  const g = await platformGuard(req, "specialties.write");
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
  const upd = await pool.query(
    `INSERT INTO specialties (code, label_ar, label_en, icon, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (code) DO UPDATE
        SET label_ar = EXCLUDED.label_ar,
            label_en = EXCLUDED.label_en,
            icon     = EXCLUDED.icon,
            sort_order = EXCLUDED.sort_order,
            is_active  = EXCLUDED.is_active,
            updated_at = NOW()
     RETURNING id, code, label_ar, label_en, icon, sort_order, is_active`,
    [v.code, v.label_ar, v.label_en ?? null, v.icon ?? null, v.sort_order, v.is_active],
  );
  return NextResponse.json({ ok: true, specialty: upd.rows[0] });
}

export async function DELETE(req: Request) {
  const g = await platformGuard(req, "specialties.write");
  if (!g.ok) return g.res;
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }
  const pool = getPool();
  // Soft delete: deactivate instead of removing so historical FKs remain valid.
  await pool.query(`UPDATE specialties SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
