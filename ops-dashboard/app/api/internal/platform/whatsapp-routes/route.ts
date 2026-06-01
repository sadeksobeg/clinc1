/** whatsapp_inbound_routes CRUD admin API. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { platformGuard } from "@/lib/platform/platformAuth";

const upsertSchema = z
  .object({
    id: z.number().int().positive().optional(),
    to_number: z.string().min(6).max(32),
    hub_clinic_id: z.number().int().positive(),
    allowed_clinic_ids: z.array(z.number().int().positive()).default([]),
    welcome_message_ar: z.string().max(1000).nullable().optional(),
    is_active: z.boolean().default(true),
    notes: z.string().max(500).nullable().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const g = await platformGuard(req, "whatsapp_routing.read");
  if (!g.ok) return g.res;
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, to_number, hub_clinic_id, allowed_clinic_ids,
            welcome_message_ar, is_active, notes, created_at, updated_at
       FROM whatsapp_inbound_routes
       ORDER BY id ASC`,
  );
  return NextResponse.json({ ok: true, routes: r.rows });
}

export async function POST(req: Request) {
  const g = await platformGuard(req, "whatsapp_routing.write");
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const pool = getPool();
  const r = await pool.query(
    `INSERT INTO whatsapp_inbound_routes
       (to_number, hub_clinic_id, allowed_clinic_ids, welcome_message_ar, is_active, notes)
     VALUES ($1, $2, $3::bigint[], $4, $5, $6)
     ON CONFLICT (to_number) DO UPDATE
       SET hub_clinic_id = EXCLUDED.hub_clinic_id,
           allowed_clinic_ids = EXCLUDED.allowed_clinic_ids,
           welcome_message_ar = EXCLUDED.welcome_message_ar,
           is_active = EXCLUDED.is_active,
           notes = EXCLUDED.notes,
           updated_at = NOW()
     RETURNING id, to_number, hub_clinic_id, allowed_clinic_ids,
               welcome_message_ar, is_active, notes`,
    [
      v.to_number,
      v.hub_clinic_id,
      v.allowed_clinic_ids,
      v.welcome_message_ar ?? null,
      v.is_active,
      v.notes ?? null,
    ],
  );
  return NextResponse.json({ ok: true, route: r.rows[0] });
}

export async function DELETE(req: Request) {
  const g = await platformGuard(req, "whatsapp_routing.write");
  if (!g.ok) return g.res;
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }
  const pool = getPool();
  await pool.query(`UPDATE whatsapp_inbound_routes SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
