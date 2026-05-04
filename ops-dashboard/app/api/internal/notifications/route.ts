import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

const createSchema = z.object({
  type: z.string().min(2).max(80),
  title: z.string().min(2).max(200),
  body: z.string().min(1).max(2000),
});

function readClinicId(req: Request): number {
  return Number(req.headers.get("x-clinic-id") || 0);
}

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = readClinicId(req);
  if (!clinicId) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, type, title, body, read, created_at
     FROM notifications
     WHERE clinic_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [clinicId],
  );
  return NextResponse.json({ ok: true, notifications: r.rows });
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = readClinicId(req);
  if (!clinicId) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const pool = getPool();
  const out = await pool.query(
    `INSERT INTO notifications (clinic_id, type, title, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, type, title, body, read, created_at`,
    [clinicId, parsed.data.type, parsed.data.title, parsed.data.body],
  );
  return NextResponse.json({ ok: true, notification: out.rows[0] }, { status: 201 });
}

export async function PATCH(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const clinicId = readClinicId(req);
  if (!clinicId) return NextResponse.json({ ok: false, error: "missing_clinic_scope" }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const id = Number((body as { id?: unknown }).id || 0);
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  const pool = getPool();
  await pool.query(`UPDATE notifications SET read = TRUE WHERE id = $1 AND clinic_id = $2`, [id, clinicId]);
  return NextResponse.json({ ok: true });
}
