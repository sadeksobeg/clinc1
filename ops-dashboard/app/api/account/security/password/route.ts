import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(8).max(200),
  confirm_password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.sub) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const clinicId = Number(session.clinicId ?? 0);
  const userId = Number(session.sub);
  if (!clinicId || !userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  if (parsed.data.new_password !== parsed.data.confirm_password) {
    return NextResponse.json({ ok: false, error: "password_mismatch" }, { status: 400 });
  }

  const pool = getPool();
  const r = await pool.query(
    `SELECT password_hash
     FROM staff_users
     WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [userId, clinicId],
  );
  const hash = r.rows[0]?.password_hash as string | null | undefined;
  if (!hash) return NextResponse.json({ ok: false, error: "password_not_set" }, { status: 400 });
  const ok = bcrypt.compareSync(parsed.data.current_password, hash);
  if (!ok) return NextResponse.json({ ok: false, error: "invalid_current_password" }, { status: 401 });

  const newHash = await bcrypt.hash(parsed.data.new_password, 10);
  await pool.query(
    `UPDATE staff_users
     SET password_hash = $1,
         updated_at = NOW()
     WHERE id = $2 AND clinic_id = $3`,
    [newHash, userId, clinicId],
  );
  return NextResponse.json({ ok: true });
}
