import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(6).max(40).optional(),
  avatar: z.string().url().max(400).nullable().optional(),
  timezone: z.string().min(2).max(80).optional(),
  language: z.string().min(2).max(12).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.sub) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const clinicId = Number(session.clinicId ?? 0);
  const userId = Number(session.sub);
  if (!clinicId || !userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const pool = getPool();
  const userR = await pool.query(
    `SELECT id, email, display_name
     FROM staff_users
     WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [userId, clinicId],
  );
  if (!userR.rows[0]) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  const clinicR = await pool.query(`SELECT timezone, metadata FROM clinics WHERE id = $1`, [clinicId]);
  const meta = (clinicR.rows[0]?.metadata ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    ok: true,
    profile: {
      name: String(userR.rows[0].display_name ?? ""),
      email: String(userR.rows[0].email ?? ""),
      phone: String(meta.owner_phone ?? meta.owner_whatsapp ?? ""),
      avatar: typeof meta.owner_avatar_url === "string" ? meta.owner_avatar_url : "",
      timezone: String(clinicR.rows[0]?.timezone ?? "Asia/Amman"),
      language: typeof meta.language === "string" ? meta.language : "ar",
    },
  });
}

export async function PATCH(req: Request) {
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
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const body = parsed.data;
  const pool = getPool();
  if (typeof body.name === "string") {
    await pool.query(
      `UPDATE staff_users
       SET display_name = $1, updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
      [body.name.trim(), userId, clinicId],
    );
  }

  const clinicR = await pool.query(`SELECT metadata FROM clinics WHERE id = $1`, [clinicId]);
  const meta = (clinicR.rows[0]?.metadata ?? {}) as Record<string, unknown>;
  const nextMeta = {
    ...meta,
    owner_phone: typeof body.phone === "string" ? body.phone.trim() : (meta.owner_phone ?? meta.owner_whatsapp ?? ""),
    owner_avatar_url: typeof body.avatar === "string" ? body.avatar : body.avatar === null ? null : (meta.owner_avatar_url ?? null),
    language: typeof body.language === "string" ? body.language.trim() : (meta.language ?? "ar"),
  };
  await pool.query(
    `UPDATE clinics
     SET timezone = COALESCE($1, timezone),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $3`,
    [typeof body.timezone === "string" ? body.timezone.trim() : null, JSON.stringify(nextMeta), clinicId],
  );

  return NextResponse.json({ ok: true });
}
