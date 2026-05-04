"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Landmark, UploadCloud, Wallet } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
// NOTE: Use native <select> here to avoid aria-hidden/focus issues on some browsers/layouts.
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { formatCurrency } from "@/lib/format";
import { localizeApiError } from "@/lib/i18n/errors";
import { statusLabel } from "@/lib/i18n/status";

type BillingSnapshot = {
  status: "trial" | "trial_expiring" | "trial_expired" | "active" | "past_due" | "grace" | "suspended" | "expired" | "cancelled";
  trial_days_left: number;
  trial_ends_at: string | null;
  next_renewal_at: string | null;
  doctor_count: number;
  extra_doctors: number;
  estimated_total_usd: number;
  is_locked: boolean;
  doctor_limit?: number;
  doctor_limit_reached?: boolean;
};

type PaymentRequestRow = {
  id: number;
  request_type: string;
  payment_method: "cash" | "shamcash" | "manual_transfer";
  amount_usd: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_at: string;
  reviewed_at?: string | null;
  reference_code?: string | null;
};

type BillingResponse = {
  ok?: boolean;
  snapshot?: BillingSnapshot;
  payment_requests?: PaymentRequestRow[];
  invoices?: Array<{
    id: number;
    invoice_no: string;
    amount_usd: number;
    currency: string;
    status: string;
    issued_at: string;
    paid_at?: string | null;
    receipt_no?: string | null;
  }>;
  error?: string;
};

type PaymentMethod = "cash" | "shamcash" | "manual_transfer";

const SHAM_CASH_WALLET = "SY-9988-1182";

function isValidHttpUrl(raw: string): boolean {
  const s = String(raw || "").trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function ManualBillingWorkspace() {
  const [context, setContext] = useState<{ role?: string; scope?: string; acting_clinic_id?: number | null }>({});
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [requests, setRequests] = useState<PaymentRequestRow[]>([]);
  const [invoices, setInvoices] = useState<BillingResponse["invoices"]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amountUsd, setAmountUsd] = useState<string>("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [note, setNote] = useState("");

  const amount = useMemo(() => {
    const n = Number(amountUsd);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amountUsd]);

  const isPlatformSuperAdmin = String(context.role || "").toLowerCase() === "super_admin" && context.scope === "platform";
  const actingClinicId = Number(context.acting_clinic_id || 0) || 0;
  const receiptRequired = method === "shamcash" || method === "manual_transfer";
  const receiptInvalid = Boolean(receiptUrl.trim()) && !isValidHttpUrl(receiptUrl);

  async function load() {
    setLoading(true);
    try {
      const ctxRes = await fetchWithRetry("/api/platform/context", { cache: "no-store" });
      const ctxJson = (await ctxRes.json().catch(() => ({}))) as { role?: string; scope?: string; acting_clinic_id?: number | null };
      setContext({ role: ctxJson.role, scope: ctxJson.scope, acting_clinic_id: ctxJson.acting_clinic_id ?? null });
      const platform = String(ctxJson.role || "").toLowerCase() === "super_admin" && ctxJson.scope === "platform";
      const acting = Number(ctxJson.acting_clinic_id || 0) || 0;
      if (platform && !acting) {
        toast.error("اختر عيادة من Platform Switcher لعرض الفوترة.");
        return;
      }
      const res = await fetchWithRetry("/api/ops/billing/local", { cache: "no-store" });
      const out = (await res.json().catch(() => ({}))) as BillingResponse;
      if (!res.ok || !out.ok || !out.snapshot) {
        toast.error(localizeApiError(out.error) || "تعذر تحميل بيانات الفوترة.");
        return;
      }
      setSnapshot(out.snapshot);
      setRequests(Array.isArray(out.payment_requests) ? out.payment_requests : []);
      setInvoices(Array.isArray(out.invoices) ? out.invoices : []);
      if (out.snapshot.estimated_total_usd > 0) setAmountUsd(String(out.snapshot.estimated_total_usd));
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitPaymentRequest() {
    if (amount <= 0) {
      toast.error("أدخل مبلغًا صحيحًا.");
      return;
    }
    if (isPlatformSuperAdmin && !actingClinicId) {
      toast.error("اختر عيادة من Platform Switcher أولاً.");
      return;
    }
    if ((method === "shamcash" || method === "manual_transfer") && !receiptUrl.trim()) {
      toast.error("رابط الإيصال مطلوب لطرق التحويل.");
      return;
    }
    if ((method === "shamcash" || method === "manual_transfer") && receiptUrl.trim() && !isValidHttpUrl(receiptUrl)) {
      toast.error("رابط الإيصال غير صالح. استخدم رابطًا يبدأ بـ http أو https.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithRetry("/api/ops/billing/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_method: method,
          amount_usd: amount,
          receipt_url: receiptUrl.trim() || undefined,
          reference_code: referenceCode.trim() || undefined,
          note: note.trim() || undefined,
          requested_by: "clinic_admin",
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر إرسال طلب الدفع.");
        return;
      }
      toast.success("تم إرسال طلب الدفع للمراجعة اليدوية.");
      setReferenceCode("");
      setReceiptUrl("");
      setNote("");
      await load();
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-cg-5">
      <header className="flex flex-col gap-cg-1">
        <p className="text-ds-body text-muted-foreground">الفوترة اليدوية للسوق المحلي (نقدي + شام كاش)</p>
        <h1 className="text-ds-h1 font-semibold tracking-tight">الفوترة</h1>
      </header>

      {loading ? (
        <div className="grid gap-cg-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={`metric-skeleton-${i}`} className="glass-card">
              <CardContent className="flex flex-col gap-cg-2 p-cg-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {snapshot ? (
        <div className="grid gap-cg-4 md:grid-cols-4">
          <MetricCard title="التسعير" value="حسب لقطة الفوترة" hint="القيم التفصيلية مصدرها نظام الفوترة." />
          <MetricCard title="عدد الأطباء" value={`${snapshot.doctor_count}`} hint={`الإضافي: ${snapshot.extra_doctors}`} />
          <MetricCard title="التقدير الشهري" value={formatCurrency(snapshot.estimated_total_usd)} hint="محسوب تلقائيًا" />
          <MetricCard title="الحالة" value={statusLabel(snapshot.status)} hint={snapshot.next_renewal_at ? `تاريخ التجديد: ${new Date(snapshot.next_renewal_at).toLocaleDateString("ar-SA")}` : "لا يوجد تاريخ تجديد"} />
        </div>
      ) : null}
      {snapshot?.doctor_limit ? (
        <Card className={snapshot.doctor_limit_reached ? "border-warning/50 bg-warning/5" : "glass-card"}>
          <CardContent className="flex items-center justify-between gap-cg-3 p-cg-4 text-ds-body">
            <div>
              <p className="font-medium">حد الأطباء ضمن الباقة</p>
              <p className="text-muted-foreground">
                المستخدم {snapshot.doctor_count} من {snapshot.doctor_limit}
              </p>
            </div>
            {snapshot.doctor_limit_reached ? <Badge variant="outline">بلغت الحد</Badge> : <Badge variant="secondary">ضمن الحد</Badge>}
          </CardContent>
        </Card>
      ) : null}

      {snapshot?.status === "trial" || snapshot?.status === "trial_expiring" ? (
        <Card className="glass-card border-primary/30">
          <CardContent className="flex items-center justify-between gap-cg-3 p-cg-5">
            <div className="flex flex-col gap-cg-1">
              <p className="text-ds-body text-muted-foreground">
                {snapshot.status === "trial_expiring" ? "التجربة تقترب من الانتهاء" : "فترة تجريبية مجانية (بدون بطاقة)"}
              </p>
              <p className="text-ds-h2 font-semibold">الأيام المتبقية: {snapshot.trial_days_left}</p>
            </div>
            <Badge variant="secondary" className="gap-cg-1">
              <Clock3 className="h-3.5 w-3.5" />
              تجريبي
            </Badge>
          </CardContent>
        </Card>
      ) : null}

      {snapshot?.is_locked ? (
        <Card className="border-danger/40 bg-danger/5">
          <CardContent className="flex items-start gap-cg-3 p-cg-5">
            <AlertTriangle className="mt-cg-1 h-5 w-5 text-danger" />
            <div>
              <p className="font-semibold">تم إيقاف الأتمتة حتى اعتماد الدفع</p>
              <p className="text-ds-body text-muted-foreground">
                لوحة التحكم متاحة، لكن الردود التلقائية متوقفة حتى الموافقة على الطلب.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-cg-5 lg:grid-cols-[1.2fr_1fr]">
        <WorkspacePanel title="إرسال طلب دفع" subtitle="الخطوة 1: إدخال بيانات الدفع" contentClassName="flex flex-col gap-cg-4 p-cg-4">
            <div className="grid gap-cg-3 md:grid-cols-2">
              <Field label="طريقة الدفع">
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-cg-3 py-cg-2 text-ds-body outline-none focus:ring-2 focus:ring-primary"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                >
                  <option value="cash">نقدي</option>
                  <option value="shamcash">شام كاش</option>
                  <option value="manual_transfer">تحويل يدوي</option>
                </select>
              </Field>
              <Field label="المبلغ (USD)">
                <Input value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} placeholder="120" />
              </Field>
            </div>

            {method === "shamcash" ? (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-cg-3 text-ds-body">
                <p className="mb-cg-1 font-medium">محفظة شام كاش</p>
                <p className="font-mono">{SHAM_CASH_WALLET}</p>
                <p className="mt-cg-2 text-muted-foreground">بعد التحويل أضف رابط الإيصال ثم أرسل الطلب.</p>
              </div>
            ) : null}

            <Field label="رابط الإيصال (مطلوب للتحويل)">
              <Input
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
                placeholder="https://..."
                aria-invalid={receiptInvalid}
                className={receiptInvalid ? "border-danger/60 focus-visible:ring-danger" : ""}
              />
              {receiptRequired && !receiptUrl.trim() ? (
                <p className="text-ds-small text-warning">رابط الإيصال مطلوب لهذه الطريقة.</p>
              ) : null}
              {receiptInvalid ? <p className="text-ds-small text-danger">الرابط غير صالح. استخدم `http://` أو `https://`.</p> : null}
            </Field>
            <Field label="المرجع (اختياري)">
              <Input value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder="رقم العملية" />
            </Field>
            <Field label="ملاحظات">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="أي تفاصيل لفريق المالية..." />
            </Field>

            <div className="flex flex-wrap gap-cg-2">
              <Button onClick={submitPaymentRequest} disabled={submitting || loading || amount <= 0 || (receiptRequired && !receiptUrl.trim()) || receiptInvalid}>
                <UploadCloud className="h-4 w-4" />
                {submitting ? "جار الإرسال..." : "إرسال طلب الدفع"}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/billing/admin">فتح موافقات الإدارة</Link>
              </Button>
            </div>
        </WorkspacePanel>

        <WorkspacePanel title="طرق الدفع" subtitle="الخطوة 2: نفّذ وارفِق الإيصال" contentClassName="flex flex-col gap-cg-3 p-cg-4 text-ds-body">
            <MethodRow icon={Landmark} title="نقدي" desc="طلب تحصيل من مندوب المكتب أو الفريق." />
            <MethodRow icon={Wallet} title="شام كاش" desc="تحويل محلي للمحفظة ثم رفع رابط الإيصال." />
            <MethodRow icon={CheckCircle2} title="اعتماد يدوي" desc="يقوم مسؤول المالية بتفعيل الاشتراك بعد المراجعة." />
        </WorkspacePanel>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">طلبات الدفع الأخيرة</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-ds-body text-muted-foreground">جار تحميل الطلبات...</p> : null}
          {!loading && requests.length === 0 ? <p className="text-ds-body text-muted-foreground">لا توجد طلبات دفع بعد.</p> : null}
          <div className="flex flex-col gap-cg-2">
            {requests.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-cg-2 rounded-xl border border-border/60 p-cg-3 text-ds-body">
                <div>
                  <p className="font-medium">
                    #{row.id} - {statusLabel(row.payment_method)} - {formatCurrency(Number(row.amount_usd || 0))}
                  </p>
                  <p className="text-ds-small text-muted-foreground">{new Date(row.requested_at).toLocaleString("ar-SA")}</p>
                </div>
                <Badge variant={row.status === "approved" ? "default" : row.status === "pending" ? "secondary" : "outline"}>
                  {statusLabel(row.status)}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">الفواتير والإيصالات</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-2">
          {(!invoices || invoices.length === 0) ? <p className="text-ds-body text-muted-foreground">لا توجد فواتير بعد.</p> : null}
          {(invoices || []).map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-xl border border-border/60 p-cg-3 text-ds-body">
              <div>
                <p className="font-medium">{row.invoice_no}</p>
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
    </div>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="flex flex-col gap-cg-1 p-cg-4">
        <p className="text-ds-small text-muted-foreground">{title}</p>
        <p className="text-ds-h3 font-semibold">{value}</p>
        <p className="text-ds-small text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function MethodRow({ icon: Icon, title, desc }: { icon: ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/60 p-cg-3">
      <div className="mb-cg-1 flex items-center gap-cg-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="font-medium">{title}</p>
      </div>
      <p className="text-ds-small text-muted-foreground">{desc}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-cg-2">
      <p className="text-ds-small font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
