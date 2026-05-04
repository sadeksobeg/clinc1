import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { requirePlatformPerm } from "@/lib/platform/platformPerms";
import { insertAuditLog } from "@/lib/auditTrail";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    clinic_name: z.string().min(2).max(200),
    owner_name: z.string().min(2).max(200),
    owner_email: z.string().email().max(254),
    owner_password: z.string().min(8).max(200),
    doctors_count: z.number().int().min(1).max(50).default(1),
    trial_days: z.number().int().min(1).max(30).default(7),
  })
  .strict();

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "clinic";
}

async function nextUniqueSlug(pool: ReturnType<typeof getPool>, base: string) {
  const clean = base || "clinic";
  for (let i = 0; i < 50; i += 1) {
    const cand = i === 0 ? clean : `${clean}-${i + 1}`;
    const exists = await pool.query(`SELECT 1 FROM clinics WHERE slug=$1 AND deleted_at IS NULL LIMIT 1`, [cand]);
    if (!exists.rows[0]) return cand;
  }
  return `${clean}-${Date.now()}`;
}

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const perm = await requirePlatformPerm(req, "clinic.create");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const pool = getPool();
  const actor = Number(req.headers.get("x-user-id") || 0) || null;
  const b = parsed.data;

  // Basic uniqueness guard (dev-friendly).
  const existing = await pool.query(
    `SELECT clinic_id FROM staff_users WHERE lower(email)=lower($1) AND deleted_at IS NULL ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    [b.owner_email],
  );
  if (existing.rows[0]) return NextResponse.json({ ok: false, error: "email_already_exists" }, { status: 409 });

  const slug = await nextUniqueSlug(pool, slugify(b.clinic_name));
  const passwordHash = await bcrypt.hash(b.owner_password, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const clinicR = await client.query<{ id: number }>(
      `INSERT INTO clinics (slug, name, timezone, metadata, created_at, updated_at)
       VALUES ($1, $2, 'Asia/Amman', $3::jsonb, NOW(), NOW())
       RETURNING id`,
      [
        slug,
        b.clinic_name,
        JSON.stringify({
          owner_name: b.owner_name,
          owner_email: b.owner_email.toLowerCase(),
          source: "platform_create",
        }),
      ],
    );
    const clinicId = Number(clinicR.rows[0]?.id || 0);
    if (!clinicId) throw new Error("clinic_create_failed");

    const userR = await client.query<{ id: number }>(
      `INSERT INTO staff_users (clinic_id, email, display_name, role, password_hash, is_active, require_mfa, security_flags, created_at, updated_at)
       VALUES ($1, $2, $3, 'admin', $4, TRUE, FALSE, '{}'::jsonb, NOW(), NOW())
       RETURNING id`,
      [clinicId, b.owner_email.toLowerCase(), b.owner_name, passwordHash],
    );
    const userId = Number(userR.rows[0]?.id || 0);

    await client.query(
      `INSERT INTO clinic_local_subscriptions
         (clinic_id, status, trial_started_at, trial_ends_at, base_price_usd, included_doctors, extra_doctor_price_usd, metadata, created_at, updated_at)
       VALUES
         ($1, 'trial', NOW(), NOW() + ($2::text || ' days')::interval, 120, 1, 30, $3::jsonb, NOW(), NOW())
       ON CONFLICT (clinic_id) DO UPDATE
       SET status = 'trial',
           trial_started_at = NOW(),
           trial_ends_at = NOW() + ($2::text || ' days')::interval,
           updated_at = NOW()`,
      [clinicId, b.trial_days, JSON.stringify({ created_by: "platform", doctors_limit: b.doctors_count })],
    );

    for (let i = 0; i < b.doctors_count; i += 1) {
      const dr = await client.query<{ id: number }>(
        `INSERT INTO doctors (clinic_id, display_name, specialty, slot_duration_minutes, is_active, created_at, updated_at)
         VALUES ($1, $2, 'general', 15, TRUE, NOW(), NOW())
         RETURNING id`,
        [clinicId, `Doctor ${i + 1}`],
      );
      const doctorId = Number(dr.rows[0]?.id || 0);
      if (doctorId > 0) {
        // Default doctor working hours: all days 09:00–21:00
        for (let weekday = 0; weekday <= 6; weekday += 1) {
          await client.query(
            `INSERT INTO doctor_working_hours (doctor_id, weekday, opens_at, closes_at, updated_at)
             VALUES ($1, $2, '09:00'::time, '21:00'::time, NOW())
             ON CONFLICT (doctor_id, weekday) DO UPDATE
               SET opens_at = EXCLUDED.opens_at,
                   closes_at = EXCLUDED.closes_at,
                   updated_at = NOW()`,
            [doctorId, weekday],
          );
        }
      }
    }

    // Default public working hours (needed for booking UX clarity)
    // 0=Sun ... 6=Sat. Keep it simple: open all days 09:00–21:00.
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      await client.query(
        `INSERT INTO clinic_public_hours (clinic_id, weekday, is_closed, opens_at, closes_at, updated_at)
         VALUES ($1, $2, FALSE, '09:00'::time, '21:00'::time, NOW())
         ON CONFLICT (clinic_id, weekday) DO UPDATE
           SET is_closed = EXCLUDED.is_closed,
               opens_at = EXCLUDED.opens_at,
               closes_at = EXCLUDED.closes_at,
               updated_at = NOW()`,
        [clinicId, weekday],
      );
    }

    await insertAuditLog(client, {
      clinicId,
      actorType: "staff",
      actorId: actor ? String(actor) : null,
      action: "platform.clinic.created",
      entityType: "clinic",
      entityId: String(clinicId),
      payload: { slug, owner_email: b.owner_email.toLowerCase(), doctors_count: b.doctors_count, trial_days: b.trial_days },
    }).catch(() => undefined);

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, clinic_id: clinicId, clinic_slug: slug, admin_user_id: userId }, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "create_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

