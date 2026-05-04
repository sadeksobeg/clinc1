import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { checkLoginRateLimit } from "@/lib/loginRateLimit";
import { insertAuditLog } from "@/lib/auditTrail";

const bodySchema = z.object({
  token: z.string().min(16).max(300),
  password: z.string().min(8).max(200),
  confirm_password: z.string().min(8).max(200),
});

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!checkLoginRateLimit(`reset:${ip}`, 15, 15 * 60_000)) {
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
  if (parsed.data.password !== parsed.data.confirm_password) {
    return NextResponse.json({ ok: false, error: "password_mismatch" }, { status: 400 });
  }

  const pool = getPool();
  const hash = tokenHash(parsed.data.token.trim());
  try {
    const tokenR = await pool.query(
      `SELECT id, staff_user_id, clinic_id, email
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [hash],
    );
    const tokenRow = tokenR.rows[0] as { id: number; staff_user_id: number; clinic_id: number; email: string } | undefined;
    if (!tokenRow) {
      return NextResponse.json({ ok: false, error: "invalid_or_expired_token" }, { status: 400 });
    }

    const newHash = await bcrypt.hash(parsed.data.password, 10);
    await pool.query(
      `UPDATE staff_users
       SET password_hash = $1,
           is_active = true,
           updated_at = NOW()
       WHERE id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
      [newHash, tokenRow.staff_user_id, tokenRow.clinic_id],
    );
    await pool.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenRow.id],
    );
    await insertAuditLog(pool, {
      clinicId: tokenRow.clinic_id,
      actorType: "system",
      action: "auth.reset_password.completed",
      entityType: "staff_user",
      entityId: String(tokenRow.staff_user_id),
      payload: { email: tokenRow.email },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
