import type { Pool, PoolClient } from "pg";
import { resolveBillingLifecycle, type BillingLifecycleStatus } from "@/lib/billing/lifecycleEngine";

export type LocalSubscriptionStatus = BillingLifecycleStatus;
export type LocalPaymentMethod = "cash" | "shamcash" | "manual_transfer";

export type BillingSnapshot = {
  clinic_id: number;
  status: LocalSubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  next_renewal_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  doctor_count: number;
  included_doctors: number;
  base_price_usd: number;
  extra_doctor_price_usd: number;
  estimated_total_usd: number;
  extra_doctors: number;
  trial_days_left: number;
  is_trial_expired: boolean;
  is_locked: boolean;
  doctor_limit: number;
  doctor_limit_reached: boolean;
};

type SubscriptionRow = {
  id: number;
  clinic_id: number;
  status: LocalSubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  next_renewal_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  base_price_usd: string;
  included_doctors: number;
  extra_doctor_price_usd: string;
  metadata?: Record<string, unknown> | null;
};

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dayDiffCeil(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export async function ensureLocalSubscription(pool: Pool | PoolClient, clinicId: number): Promise<SubscriptionRow> {
  const existing = await pool.query<SubscriptionRow>(
    `SELECT id, clinic_id, status, trial_started_at, trial_ends_at, next_renewal_at, suspended_at, suspension_reason,
            base_price_usd::text, included_doctors, extra_doctor_price_usd::text, metadata
       FROM clinic_local_subscriptions
      WHERE clinic_id = $1
      LIMIT 1`,
    [clinicId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await pool.query<SubscriptionRow>(
    `INSERT INTO clinic_local_subscriptions (clinic_id, status)
     VALUES ($1, 'trial')
     ON CONFLICT (clinic_id) DO UPDATE SET clinic_id = EXCLUDED.clinic_id
     RETURNING id, clinic_id, status, trial_started_at, trial_ends_at, next_renewal_at, suspended_at, suspension_reason,
              base_price_usd::text, included_doctors, extra_doctor_price_usd::text, metadata`,
    [clinicId],
  );
  return inserted.rows[0];
}

export async function refreshLocalSubscriptionState(
  pool: Pool | PoolClient,
  clinicId: number,
): Promise<SubscriptionRow> {
  const sub = await ensureLocalSubscription(pool, clinicId);
  const now = new Date();

  const resolved = resolveBillingLifecycle({
    status: sub.status,
    trialEndsAt: sub.trial_ends_at,
    nextRenewalAt: sub.next_renewal_at,
    now,
  });
  const nextStatus: LocalSubscriptionStatus = resolved.status;
  const suspendedAt: string | null = resolved.suspended_at ?? sub.suspended_at;
  const suspensionReason: string | null = resolved.suspension_reason ?? sub.suspension_reason;

  if (nextStatus !== sub.status || suspendedAt !== sub.suspended_at || suspensionReason !== sub.suspension_reason) {
    const upd = await pool.query<SubscriptionRow>(
      `UPDATE clinic_local_subscriptions
          SET status = $2,
              suspended_at = $3,
              suspension_reason = $4,
              updated_at = NOW()
        WHERE clinic_id = $1
        RETURNING id, clinic_id, status, trial_started_at, trial_ends_at, next_renewal_at, suspended_at, suspension_reason,
                  base_price_usd::text, included_doctors, extra_doctor_price_usd::text, metadata`,
      [clinicId, nextStatus, suspendedAt, suspensionReason],
    );
    return upd.rows[0] ?? sub;
  }

  return sub;
}

function numberFromMetadata(md: Record<string, unknown> | null | undefined, key: string): number | null {
  const raw = md?.[key];
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function resolveDoctorLimitForSubscription(sub: {
  status: LocalSubscriptionStatus;
  included_doctors: number;
  metadata?: Record<string, unknown> | null;
}): number {
  const md = sub.metadata ?? {};
  const trialLimit = numberFromMetadata(md, "onboarding_doctors_limit");
  if ((sub.status === "trial" || sub.status === "trial_expiring") && trialLimit) {
    return trialLimit;
  }
  const purchasedExtra = numberFromMetadata(md, "purchased_extra_doctors") ?? 0;
  return Math.max(1, Number(sub.included_doctors || 1) + purchasedExtra);
}

export async function getDoctorLimitStatus(
  pool: Pool | PoolClient,
  clinicId: number,
): Promise<{ limit: number; current: number; reached: boolean; source: "trial" | "plan" }> {
  const sub = await refreshLocalSubscriptionState(pool, clinicId);
  const current = await countActiveDoctors(pool, clinicId);
  const limit = resolveDoctorLimitForSubscription(sub);
  return {
    limit,
    current,
    reached: current >= limit,
    source: sub.status === "trial" || sub.status === "trial_expiring" ? "trial" : "plan",
  };
}

export async function countActiveDoctors(pool: Pool | PoolClient, clinicId: number): Promise<number> {
  try {
    const byIsActive = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM doctors
        WHERE clinic_id = $1
          AND COALESCE(is_active, true) = true`,
      [clinicId],
    );
    return Number(byIsActive.rows[0]?.c ?? "0");
  } catch {
    const byActive = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM doctors
        WHERE clinic_id = $1
          AND COALESCE(active, true) = true`,
      [clinicId],
    );
    return Number(byActive.rows[0]?.c ?? "0");
  }
}

export async function getBillingSnapshot(pool: Pool | PoolClient, clinicId: number): Promise<BillingSnapshot> {
  const sub = await refreshLocalSubscriptionState(pool, clinicId);
  const doctor_count = await countActiveDoctors(pool, clinicId);
  const included_doctors = Number(sub.included_doctors || 1);
  const base_price_usd = Number(sub.base_price_usd || "120");
  const extra_doctor_price_usd = Number(sub.extra_doctor_price_usd || "30");
  const extra_doctors = Math.max(0, doctor_count - included_doctors);
  const estimated_total_usd = base_price_usd + extra_doctors * extra_doctor_price_usd;
  const doctor_limit = resolveDoctorLimitForSubscription(sub);

  const now = new Date();
  const trialEnds = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const trial_days_left = trialEnds ? dayDiffCeil(now, trialEnds) : 0;
  const is_trial_expired = Boolean(trialEnds && trialEnds.getTime() <= now.getTime());
  const is_locked = sub.status === "trial_expired" || sub.status === "suspended" || sub.status === "cancelled";

  return {
    clinic_id: clinicId,
    status: sub.status,
    trial_started_at: toIsoOrNull(sub.trial_started_at),
    trial_ends_at: toIsoOrNull(sub.trial_ends_at),
    next_renewal_at: toIsoOrNull(sub.next_renewal_at),
    suspended_at: toIsoOrNull(sub.suspended_at),
    suspension_reason: sub.suspension_reason ?? null,
    doctor_count,
    included_doctors,
    base_price_usd,
    extra_doctor_price_usd,
    estimated_total_usd,
    extra_doctors,
    trial_days_left,
    is_trial_expired,
    is_locked,
    doctor_limit,
    doctor_limit_reached: doctor_count >= doctor_limit,
  };
}

export async function canClinicAutoReply(pool: Pool | PoolClient, clinicId: number): Promise<boolean> {
  const snap = await getBillingSnapshot(pool, clinicId);
  return !(snap.status === "trial_expired" || snap.status === "suspended" || snap.status === "cancelled");
}
