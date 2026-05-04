export type BillingLifecycleStatus =
  | "trial"
  | "trial_expiring"
  | "trial_expired"
  | "active"
  | "past_due"
  | "grace"
  | "suspended"
  | "cancelled";

export function resolveBillingLifecycle(args: {
  status: BillingLifecycleStatus;
  trialEndsAt?: string | null;
  nextRenewalAt?: string | null;
  now?: Date;
}): { status: BillingLifecycleStatus; suspension_reason: string | null; suspended_at: string | null } {
  const now = args.now ?? new Date();
  const trialEndsMs = args.trialEndsAt ? new Date(args.trialEndsAt).getTime() : NaN;
  const renewalMs = args.nextRenewalAt ? new Date(args.nextRenewalAt).getTime() : NaN;
  const status = args.status;

  if (status === "cancelled" || status === "suspended") {
    return { status, suspension_reason: null, suspended_at: null };
  }

  if (status === "trial" || status === "trial_expiring" || status === "trial_expired") {
    if (Number.isFinite(trialEndsMs) && now.getTime() >= trialEndsMs) {
      return { status: "trial_expired", suspension_reason: "trial_expired", suspended_at: now.toISOString() };
    }
    if (Number.isFinite(trialEndsMs) && trialEndsMs - now.getTime() <= 48 * 60 * 60 * 1000) {
      return { status: "trial_expiring", suspension_reason: null, suspended_at: null };
    }
    return { status: "trial", suspension_reason: null, suspended_at: null };
  }

  if (status === "active" || status === "past_due" || status === "grace") {
    if (!Number.isFinite(renewalMs) || now.getTime() < renewalMs) {
      return { status: "active", suspension_reason: null, suspended_at: null };
    }
    const overdueMs = now.getTime() - renewalMs;
    if (overdueMs <= 3 * 24 * 60 * 60 * 1000) {
      return { status: "grace", suspension_reason: "renewal_overdue", suspended_at: null };
    }
    if (overdueMs <= 7 * 24 * 60 * 60 * 1000) {
      return { status: "past_due", suspension_reason: "renewal_overdue", suspended_at: null };
    }
    return { status: "suspended", suspension_reason: "renewal_overdue", suspended_at: now.toISOString() };
  }

  return { status, suspension_reason: null, suspended_at: null };
}
