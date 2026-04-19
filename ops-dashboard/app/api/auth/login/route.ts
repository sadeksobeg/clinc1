import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { signOpsToken } from "@/lib/jwt";
import { checkLoginRateLimit } from "@/lib/loginRateLimit";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!checkLoginRateLimit(ip, 30, 15 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, clinic_id, role, password_hash, is_active
     FROM staff_users
     WHERE lower(email) = lower($1) AND deleted_at IS NULL
     LIMIT 1`,
    [email],
  );
  const row = r.rows[0] as
    | { id: string; clinic_id: number; role: string; password_hash: string | null; is_active: boolean }
    | undefined;
  if (!row || !row.is_active || !row.password_hash) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  let token: string;
  try {
    token = await signOpsToken({
      sub: String(row.id),
      email,
      role: row.role,
      clinicId: Number(row.clinic_id),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Auth misconfiguration";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("ops_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
