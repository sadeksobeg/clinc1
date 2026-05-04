import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { insertAuditLog } from "@/lib/auditTrail";
import { sendViaBridge } from "@/lib/bridgeSend";

const bodySchema = z
  .object({
    clinicName: z.string().min(2).max(160),
    ownerName: z.string().min(2).max(120),
    whatsapp: z.string().min(8).max(64),
    city: z.string().min(2).max(120),
    specialty: z.string().min(2).max(120),
    doctorsCount: z.coerce.number().int().min(1).max(100),
    email: z.string().email().max(200),
    password: z.string().min(8).max(200),
    trialDays: z.coerce.number().int().min(1).max(30).optional().default(3),
    browserFingerprint: z.string().min(6).max(300).optional(),
    domain: z.string().min(3).max(200).optional(),
    vat: z.string().min(3).max(120).optional(),
  })
  .strict();

type TrialSignupResult = {
  clinic_id: number;
  clinic_slug: string;
  trial_ends_at: string;
  admin_user_id: number;
  doctors_limit: number;
  direct_access_url: string;
  email_delivery: "queued" | "skipped" | "failed";
  whatsapp_delivery: "sent" | "failed";
};

function slugifyClinicName(input: string): string {
  const s = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06ff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "clinic";
}

async function nextUniqueClinicSlug(base: string): Promise<string> {
  const pool = getPool();
  const root = base.slice(0, 48);
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const r = await pool.query(`SELECT id FROM clinics WHERE slug = $1 LIMIT 1`, [candidate]);
    if (!r.rows[0]) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function sendWelcomeEmailWebhook(payload: {
  email: string;
  owner_name: string;
  clinic_name: string;
  trial_ends_at: string;
  direct_access_url: string;
}): Promise<"queued" | "skipped" | "failed"> {
  const webhook = process.env.TRIAL_WELCOME_EMAIL_WEBHOOK_URL?.trim();
  if (!webhook) return "skipped";
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok ? "queued" : "failed";
  } catch {
    return "failed";
  }
}

function buildDirectAccessUrl(email: string): string {
  const base = (process.env.OPS_PUBLIC_URL || "http://localhost:3001").replace(/\/$/, "");
  return `${base}/login?email=${encodeURIComponent(email)}`;
}

function normalize(value?: string | null): string | null {
  const v = String(value || "").trim().toLowerCase();
  return v.length ? v : null;
}

function hashIdentity(value?: string | null): string | null {
  const v = normalize(value);
  if (!v) return null;
  return createHash("sha256").update(v).digest("hex");
}

function requestIp(req: Request): string | null {
  const fromForwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fromReal = req.headers.get("x-real-ip")?.trim();
  return fromForwarded || fromReal || null;
}

export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = {
    ...parsed.data,
    trialDays: 3,
  };
  const pool = getPool();
  const client = await pool.connect();

  let result: TrialSignupResult | null = null;
  let whatsappStatus: "sent" | "failed" = "failed";
  let emailStatus: "queued" | "skipped" | "failed" = "skipped";

  const duplicateR = await pool.query(
    `SELECT c.id
     FROM clinics c
     LEFT JOIN staff_users su
       ON su.clinic_id = c.id
      AND su.deleted_at IS NULL
      AND lower(su.email) = lower($1)
     LEFT JOIN clinic_local_subscriptions cls
       ON cls.clinic_id = c.id
     WHERE c.deleted_at IS NULL
       AND (
         su.id IS NOT NULL
         OR lower(COALESCE(c.metadata->>'owner_whatsapp','')) = lower($2)
       )
       AND cls.id IS NOT NULL
     LIMIT 1`,
    [data.email, data.whatsapp],
  );
  if (duplicateR.rows[0]) {
    return NextResponse.json({ ok: false, error: "review_required" }, { status: 409 });
  }

  const identityHashes = {
    email_hash: hashIdentity(data.email),
    whatsapp_hash: hashIdentity(data.whatsapp),
    ip_hash: hashIdentity(requestIp(req)),
    browser_fingerprint_hash: hashIdentity(data.browserFingerprint),
    domain_hash: hashIdentity(data.domain),
    vat_hash: hashIdentity(data.vat),
  };
  const identityDuplicate = await pool.query(
    `SELECT id
     FROM trial_identity_fingerprints
     WHERE ($1::text IS NOT NULL AND email_hash = $1)
        OR ($2::text IS NOT NULL AND whatsapp_hash = $2)
        OR ($3::text IS NOT NULL AND ip_hash = $3)
        OR ($4::text IS NOT NULL AND browser_fingerprint_hash = $4)
        OR ($5::text IS NOT NULL AND domain_hash = $5)
        OR ($6::text IS NOT NULL AND vat_hash = $6)
     LIMIT 1`,
    [
      identityHashes.email_hash,
      identityHashes.whatsapp_hash,
      identityHashes.ip_hash,
      identityHashes.browser_fingerprint_hash,
      identityHashes.domain_hash,
      identityHashes.vat_hash,
    ],
  );
  if (identityDuplicate.rows[0]) {
    return NextResponse.json({ ok: false, error: "trial_identity_blocked" }, { status: 409 });
  }

  try {
    await client.query("BEGIN");
    const slugBase = slugifyClinicName(data.clinicName);
    const clinicSlug = await nextUniqueClinicSlug(slugBase);

    const clinicR = await client.query<{ id: number; slug: string }>(
      `INSERT INTO clinics (slug, name, timezone, metadata, created_at, updated_at)
       VALUES ($1, $2, 'Asia/Amman', $3::jsonb, NOW(), NOW())
       RETURNING id, slug`,
      [
        clinicSlug,
        data.clinicName,
        JSON.stringify({
          city: data.city,
          specialty: data.specialty,
          owner_name: data.ownerName,
          owner_whatsapp: data.whatsapp,
          source: "trial_signup",
          onboarding_required: true,
          onboarding_completed_at: null,
        }),
      ],
    );
    const clinicId = Number(clinicR.rows[0]?.id || 0);
    if (!clinicId) throw new Error("clinic_create_failed");

    const passwordHash = await bcrypt.hash(data.password, 10);
    const adminR = await client.query<{ id: number }>(
      `INSERT INTO staff_users
         (clinic_id, email, display_name, role, password_hash, is_active, created_at, updated_at)
       VALUES
         ($1, $2, $3, 'admin', $4, TRUE, NOW(), NOW())
       RETURNING id`,
      [clinicId, data.email.toLowerCase(), data.ownerName, passwordHash],
    );
    const adminUserId = Number(adminR.rows[0]?.id || 0);
    await client.query(
      `INSERT INTO trial_identity_fingerprints
       (clinic_id, email_hash, whatsapp_hash, ip_hash, browser_fingerprint_hash, domain_hash, vat_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        clinicId,
        identityHashes.email_hash,
        identityHashes.whatsapp_hash,
        identityHashes.ip_hash,
        identityHashes.browser_fingerprint_hash,
        identityHashes.domain_hash,
        identityHashes.vat_hash,
      ],
    );

    if (!adminUserId) throw new Error("admin_create_failed");

    const subR = await client.query<{ trial_ends_at: string }>(
      `INSERT INTO clinic_local_subscriptions
         (clinic_id, status, trial_started_at, trial_ends_at, base_price_usd, included_doctors, extra_doctor_price_usd, metadata, created_at, updated_at)
       VALUES
         ($1, 'trial', NOW(), NOW() + ($2::text || ' days')::interval, 120, 1, 30, $3::jsonb, NOW(), NOW())
       ON CONFLICT (clinic_id) DO UPDATE
       SET status = 'trial',
           trial_started_at = NOW(),
           trial_ends_at = NOW() + ($2::text || ' days')::interval,
           base_price_usd = 120,
           included_doctors = 1,
           extra_doctor_price_usd = 30,
           metadata = COALESCE(clinic_local_subscriptions.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = NOW()
       RETURNING trial_ends_at::text`,
      [
        clinicId,
        data.trialDays,
        JSON.stringify({
          onboarding_doctors_limit: data.doctorsCount,
          onboarding_extra_doctors: Math.max(0, data.doctorsCount - 1),
          billing_plan: "starter_120",
        }),
      ],
    );
    const trialEndsAt = String(subR.rows[0]?.trial_ends_at || "");
    if (!trialEndsAt) throw new Error("subscription_create_failed");

    for (let i = 0; i < data.doctorsCount; i += 1) {
      await client.query(
        `INSERT INTO doctors (clinic_id, display_name, specialty, slot_duration_minutes, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 15, TRUE, NOW(), NOW())`,
        [clinicId, `Doctor ${i + 1}`, data.specialty],
      );
    }

    await client.query("COMMIT");

    const welcomeText = `أهلاً ${data.ownerName}\nتم إنشاء تجربة عيادتك "${data.clinicName}" لمدة ${data.trialDays} أيام.\nرابط الدخول: ${buildDirectAccessUrl(
      data.email,
    )}`;
    const wa = await sendViaBridge(data.whatsapp, welcomeText, { kind: "staff_alert" });
    whatsappStatus = wa.ok ? "sent" : "failed";
    emailStatus = await sendWelcomeEmailWebhook({
      email: data.email,
      owner_name: data.ownerName,
      clinic_name: data.clinicName,
      trial_ends_at: new Date(trialEndsAt).toISOString(),
      direct_access_url: buildDirectAccessUrl(data.email),
    });

    result = {
      clinic_id: clinicId,
      clinic_slug: clinicR.rows[0]?.slug || clinicSlug,
      trial_ends_at: new Date(trialEndsAt).toISOString(),
      admin_user_id: adminUserId,
      doctors_limit: data.doctorsCount,
      direct_access_url: buildDirectAccessUrl(data.email),
      email_delivery: emailStatus,
      whatsapp_delivery: whatsappStatus,
    };
    await insertAuditLog(pool, {
      clinicId,
      action: "trial.signup.create",
      entityType: "clinic",
      entityId: String(clinicId),
      payload: {
        ok: true,
        source: "web_trial",
        admin_user_id: adminUserId,
        doctors_count: data.doctorsCount,
        trial_days: data.trialDays,
        whatsapp_delivery: whatsappStatus,
        email_delivery: emailStatus,
      },
    }).catch(() => undefined);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    await insertAuditLog(pool, {
      action: "trial.signup.create",
      entityType: "clinic",
      payload: { ok: false, error: e instanceof Error ? e.message : "unknown" },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "trial_signup_failed" }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, trial: result, warnings: { whatsapp_delivery: whatsappStatus, email_delivery: emailStatus } }, { status: 201 });
}
