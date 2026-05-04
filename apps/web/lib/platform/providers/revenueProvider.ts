import "server-only";

export type RevenueSummary = {
  active_clinics: number;
  trial_clinics: number;
  locked_clinics: number;
  projected_mrr_usd: number;
  approved_total_usd: number;
  approved_payments: number;
  pending_total_usd: number;
  overdue_total_usd: number;
  pending_requests: number;
  overdue_requests: number;
};

export type RevenueClinicRow = {
  clinic_id: number;
  clinic_name: string;
  status: string;
  next_renewal_at: string | null;
  doctor_count: number;
  included_doctors: number;
  base_price_usd: number;
  extra_doctor_price_usd: number;
  estimated_monthly_total_usd: number;
};

export type RevenueReminderRunRow = {
  id: number;
  trigger_source: string;
  status: string;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  error_text: string | null;
  started_at: string;
  ended_at: string | null;
};

export type RevenueSnapshot = {
  summary: RevenueSummary;
  clinics: RevenueClinicRow[];
  reminder_runs: RevenueReminderRunRow[];
};

export interface RevenueProvider {
  getSnapshot(): Promise<RevenueSnapshot>;
}

export class LocalOpsRevenueProvider implements RevenueProvider {
  async getSnapshot(): Promise<RevenueSnapshot> {
    const res = await fetch("/api/ops/billing/admin/revenue", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      summary?: Partial<RevenueSummary>;
      clinics?: RevenueClinicRow[];
      reminder_runs?: RevenueReminderRunRow[];
    };
    if (!res.ok || !json.ok) {
      throw new Error("revenue_unavailable");
    }
    const summary = json.summary ?? {};
    return {
      summary: {
        active_clinics: Number(summary.active_clinics || 0),
        trial_clinics: Number(summary.trial_clinics || 0),
        locked_clinics: Number(summary.locked_clinics || 0),
        projected_mrr_usd: Number(summary.projected_mrr_usd || 0),
        approved_total_usd: Number(summary.approved_total_usd || 0),
        approved_payments: Number(summary.approved_payments || 0),
        pending_total_usd: Number(summary.pending_total_usd || 0),
        overdue_total_usd: Number(summary.overdue_total_usd || 0),
        pending_requests: Number(summary.pending_requests || 0),
        overdue_requests: Number(summary.overdue_requests || 0),
      },
      clinics: Array.isArray(json.clinics) ? json.clinics : [],
      reminder_runs: Array.isArray(json.reminder_runs) ? json.reminder_runs : [],
    };
  }
}

