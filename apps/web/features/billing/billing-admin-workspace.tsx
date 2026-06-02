"use client";

import { RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { formatCurrency } from "@/lib/format";
import { localizeApiError } from "@/lib/i18n/errors";
import { statusLabel } from "@/lib/i18n/status";

type AdminRequestRow = {
  id: number;
  clinic_id: number;
  clinic_name: string;
  payment_method: "cash" | "shamcash" | "manual_transfer";
  amount_usd: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_at: string;
  receipt_url?: string | null;
  note?: string | null;
};

type RevenueSummary = {
  active_clinics: number;
  trial_clinics: number;
  locked_clinics: number;
  projected_mrr_usd: number;
  approved_total_usd: number;
  approved_payments: number;
  pending_total_usd?: number;
  overdue_total_usd?: number;
  pending_requests?: number;
  overdue_requests?: number;
};

type RevenueClinicRow = {
  clinic_id: number;
  clinic_name: string;
  status: string;
  doctor_count: number;
  estimated_monthly_total_usd: number;
};

type ReminderRunRow = {
  id: number;
  trigger_source: string;
  status: string;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  error_text?: string | null;
  started_at: string;
  ended_at?: string | null;
};

type InvoiceRow = {
  id: number;
  clinic_id: number;
  clinic_name: string;
  invoice_no: string;
  amount_usd: number;
  status: string;
  issued_at: string;
  receipt_no?: string | null;
};

export function BillingAdminWorkspace() {
  const [requests, setRequests] = useState<AdminRequestRow[]>([]);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [clinics, setClinics] = useState<RevenueClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [reminderRuns, setReminderRuns] = useState<ReminderRunRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  async function loadAll() {
    setLoading(true);
    try {
      const [reqRes, revRes, runRes, invRes] = await Promise.all([
        fetchWithRetry("/api/ops/billing/admin/requests?status=all&limit=120", { cache: "no-store" }),
        fetchWithRetry("/api/ops/billing/admin/revenue", { cache: "no-store" }),
        fetchWithRetry("/api/ops/billing/admin/reminders/runs", { cache: "no-store" }),
        fetchWithRetry("/api/ops/billing/admin/invoices?status=all&limit=120", { cache: "no-store" }),
      ]);
      const reqOut = (await reqRes.json().catch(() => ({}))) as { ok?: boolean; rows?: AdminRequestRow[]; error?: string };
      const revOut = (await revRes.json().catch(() => ({}))) as {
        ok?: boolean;
        summary?: RevenueSummary;
        clinics?: RevenueClinicRow[];
        reminder_runs?: ReminderRunRow[];
        error?: string;
      };
      const runOut = (await runRes.json().catch(() => ({}))) as { ok?: boolean; runs?: ReminderRunRow[]; error?: string };
      const invOut = (await invRes.json().catch(() => ({}))) as { ok?: boolean; rows?: InvoiceRow[]; error?: string };
      if (!reqRes.ok || !reqOut.ok) {
        toast.error(localizeApiError(reqOut.error) || "تعذر تحميل طلبات الفوترة.");
      } else {
        setRequests(reqOut.rows || []);
      }
      if (!revRes.ok || !revOut.ok) {
        toast.error(localizeApiError(revOut.error) || "تعذر تحميل لوحة الإيرادات.");
      } else {
        setSummary((revOut.summary as RevenueSummary) || null);
        setClinics(revOut.clinics || []);
        setReminderRuns(revOut.reminder_runs || []);
      }
      if (runRes.ok && runOut.ok && Array.isArray(runOut.runs)) {
        setReminderRuns(runOut.runs);
      }
      if (invRes.ok && invOut.ok && Array.isArray(invOut.rows)) {
        setInvoices(invOut.rows);
      }
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setLoading(false);
    }
  }

  const pendingRows = requests.filter((r) => r.status === "pending");
  const nowMs = Date.now();
  const overdueCount = pendingRows.filter((r) => nowMs - new Date(r.requested_at).getTime() > 3 * 24 * 60 * 60 * 1000).length;

  useEffect(() => {
    void loadAll();
  }, []);

  async function decide(id: number, decision: "approve" | "reject") {
    if (decision === "approve") {
      const ok = window.confirm(
        "تأكيد اعتماد الدفع؟ سيتم تفعيل الاشتراك وإصدار سند القبض. (P7: يتطلب تأكيدًا صريحًا)",
      );
      if (!ok) return;
    }
    setBusyId(id);
    try {
      const idempotency_key = `billing-admin-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
      const res = await fetchWithRetry(`/api/ops/billing/admin/requests/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reviewer: "ops_admin",
          review_note: decision === "approve" ? "اعتماد من لوحة إدارة الفوترة" : "رفض من لوحة إدارة الفوترة",
          idempotency_key,
          ...(decision === "approve"
            ? { billing_confirm: true, billing_confirm_phrase: "CONFIRM_APPROVE_PAYMENT" }
            : {}),
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر تحديث الطلب.");
        return;
      }
      toast.success(decision === "approve" ? "تم اعتماد الطلب." : "تم رفض الطلب.");
      await loadAll();
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setBusyId(null);
    }
  }

  async function runReminders() {
    setRemindersBusy(true);
    try {
      const res = await fetchWithRetry("/api/ops/billing/admin/reminders", { method: "POST" });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: number;
        failed?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر تشغيل التذكيرات.");
        return;
      }
      toast.success(`نتيجة التذكيرات: تم الإرسال ${out.sent ?? 0}، فشل ${out.failed ?? 0}، تم التجاوز ${out.skipped ?? 0}.`);
      await loadAll();
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setRemindersBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-cg-5">
      <PageHeader
        subtitle="نسق — المنصة"
        title="إدارة الفوترة"
        description="اعتمادات يدوية ولوحة إيرادات الفوترة المحلية"
        right={
          <>
            <Button variant="outline" onClick={() => void loadAll()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
            <Button onClick={runReminders} disabled={remindersBusy}>
              <WalletCards className="h-4 w-4" />
              {remindersBusy ? "جار تشغيل التذكيرات..." : "تشغيل تذكيرات واتساب"}
            </Button>
          </>
        }
      />

      <div className="grid gap-cg-4 md:grid-cols-3">
        <StatCard title="الإيراد الشهري المتوقع" value={formatCurrency(Number(summary?.projected_mrr_usd || 0))} />
        <StatCard title="العيادات النشطة" value={`${summary?.active_clinics ?? 0}`} />
        <StatCard title="المعتمد هذا الشهر" value={formatCurrency(Number(summary?.approved_total_usd || 0))} />
      </div>
      <div className="grid gap-cg-4 md:grid-cols-4">
        <StatCard title="طلبات معلقة" value={`${summary?.pending_requests ?? pendingRows.length}`} />
        <StatCard title="طلبات متأخرة" value={`${summary?.overdue_requests ?? overdueCount}`} />
        <StatCard title="قيمة معلقة" value={formatCurrency(Number(summary?.pending_total_usd || 0))} />
        <StatCard title="قيمة متأخرة" value={formatCurrency(Number(summary?.overdue_total_usd || 0))} />
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">الطلبات المعلقة والأخيرة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-2">
          {loading ? <p className="text-ds-body text-muted-foreground">جار تحميل الطلبات...</p> : null}
          {!loading && requests.length === 0 ? <p className="text-ds-body text-muted-foreground">لا توجد طلبات.</p> : null}
          {requests.map((row) => (
            <div key={row.id} className="rounded-xl border border-border/60 p-cg-3">
              <div className="flex flex-wrap items-center justify-between gap-cg-2">
                <div>
                  <p className="font-medium">
                    #{row.id} - {row.clinic_name} - {formatCurrency(Number(row.amount_usd || 0))}
                  </p>
                  <p className="text-ds-small text-muted-foreground">
                    {statusLabel(row.payment_method)} - {new Date(row.requested_at).toLocaleString("ar-SA")}
                  </p>
                </div>
                <Badge variant={row.status === "approved" ? "default" : row.status === "pending" ? "secondary" : "outline"}>
                  {statusLabel(row.status)}
                </Badge>
              </div>
              {row.note ? <p className="mt-cg-2 text-ds-small text-muted-foreground">{row.note}</p> : null}
              {row.receipt_url ? (
                <a href={row.receipt_url} target="_blank" rel="noreferrer" className="mt-cg-2 inline-block text-ds-small text-primary underline">
                  فتح الإيصال
                </a>
              ) : null}
              {row.status === "pending" ? (
                <div className="mt-cg-3 flex gap-cg-2">
                  <Button size="sm" onClick={() => void decide(row.id, "approve")} disabled={busyId === row.id}>
                    <ShieldCheck className="h-4 w-4" />
                    اعتماد
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void decide(row.id, "reject")} disabled={busyId === row.id}>
                    رفض
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">تشغيلات التذكير الأخيرة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-2">
          {reminderRuns.length === 0 ? <p className="text-ds-body text-muted-foreground">لا توجد تشغيلات بعد.</p> : null}
          {reminderRuns.map((row) => (
            <div key={row.id} className="rounded-xl border border-border/60 p-cg-3 text-ds-body">
              <div className="flex items-center justify-between gap-cg-2">
                <p className="font-medium">Run #{row.id} - {statusLabel(row.status)}</p>
                <p className="text-ds-small text-muted-foreground">{new Date(row.started_at).toLocaleString("ar-SA")}</p>
              </div>
              <p className="mt-cg-1 text-ds-small text-muted-foreground">
                sent: {row.sent_count} / failed: {row.failed_count} / skipped: {row.skipped_count} / source: {row.trigger_source}
              </p>
              {row.failed_count > 0 ? (
                <div className="mt-cg-2">
                  <Button size="sm" variant="outline" onClick={runReminders} disabled={remindersBusy}>
                    إعادة تشغيل التذكيرات (Retry)
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">التسوية (Invoices / Receipts)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-2">
          {invoices.length === 0 ? <p className="text-ds-body text-muted-foreground">لا توجد فواتير بعد.</p> : null}
          {invoices.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-xl border border-border/60 p-cg-3 text-ds-body">
              <div>
                <p className="font-medium">{row.invoice_no} - {row.clinic_name}</p>
                <p className="text-ds-small text-muted-foreground">
                  {statusLabel(row.status)} - {new Date(row.issued_at).toLocaleString("ar-SA")}
                </p>
              </div>
              <div className="text-end">
                <p className="font-semibold">{formatCurrency(Number(row.amount_usd || 0))}</p>
                {row.receipt_no ? <p className="text-ds-small text-muted-foreground">Receipt: {row.receipt_no}</p> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">تفصيل إيرادات العيادات</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-2">
          {clinics.map((row) => (
            <div key={row.clinic_id} className="flex items-center justify-between rounded-xl border border-border/60 p-cg-3 text-ds-body">
              <div>
                <p className="font-medium">{row.clinic_name}</p>
                <p className="text-ds-small text-muted-foreground">
                  {statusLabel(row.status)} - الأطباء: {row.doctor_count}
                </p>
              </div>
              <p className="font-semibold">{formatCurrency(Number(row.estimated_monthly_total_usd || 0))}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-cg-4">
        <p className="text-ds-small text-muted-foreground">{title}</p>
        <p className="text-ds-h1 font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
