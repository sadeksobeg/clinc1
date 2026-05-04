import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { checkLoginRateLimit } from "@/lib/loginRateLimit";
import { insertAuditLog } from "@/lib/auditTrail";

const bodySchema = z.object({
  email: z.string().email(),
});

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function buildResetLink(token: string): string {
  const base = (process.env.OPS_PUBLIC_URL || "http://localhost:3001").replace(/\/$/, "");
  return `${base}/login?mode=reset&token=${encodeURIComponent(token)}`;
}

async function notifyResetByWebhook(email: string, resetLink: string): Promise<"queued" | "skipped" | "failed"> {
  const webhook = process.env.AUTH_RESET_EMAIL_WEBHOOK_URL?.trim();
  if (!webhook) return "skipped";
  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        reset_link: resetLink,
        kind: "password_reset",
      }),
    });
    return r.ok ? "queued" : "failed";
  } catch {
    return "failed";
  }
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!checkLoginRateLimit(`forgot:${ip}`, 12, 15 * 60_000)) {
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

  const email = parsed.data.email.trim().toLowerCase();
  const pool = getPool();
  try {
    const userR = await pool.query(
      `SELECT id, clinic_id
       FROM staff_users
       WHERE lower(email) = lower($1)
         AND deleted_at IS NULL
         AND is_active = true
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [email],
    );
    const user = userR.rows[0] as { id: number; clinic_id: number } | undefined;
    if (user) {
      await pool.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE staff_user_id = $1
           AND used_at IS NULL`,
        [user.id],
      );

      const raw = randomBytes(32).toString("base64url");
      const hash = tokenHash(raw);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await pool.query(
        `INSERT INTO password_reset_tokens (clinic_id, staff_user_id, email, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.clinic_id, user.id, email, hash, expiresAt.toISOString()],
      );

      const resetLink = buildResetLink(raw);
      const delivery = await notifyResetByWebhook(email, resetLink);
      await insertAuditLog(pool, {
        clinicId: user.clinic_id,
        actorType: "system",
        action: "auth.forgot_password.requested",
        entityType: "staff_user",
        entityId: String(user.id),
        payload: { email, delivery },
      }).catch(() => undefined);
    }

    // Always return success to prevent user enumeration.
    return NextResponse.json({
      ok: true,
      message: "If an account exists, a reset link has been sent.",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
