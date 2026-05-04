"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/platform/AsyncState";
import { TableSkeleton } from "@/components/platform/TableSkeleton";

type TrialFunnel = {
  started: number;
  step_1: number;
  step_2: number;
  step_3: number;
  submitted: number;
  success: number;
  conversion_rate: number;
};

type RevenueSummary = {
  active_clinics?: number;
  trial_clinics?: number;
  locked_clinics?: number;
  pending_requests?: number;
  overdue_requests?: number;
};

export default function PlatformGrowthPage() {
  const [trial, setTrial] = useState<TrialFunnel | null>(null);
  const [rev, setRev] = useState<RevenueSummary>({});
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      setErrMsg("");
      const [trialRes, revRes] = await Promise.all([
        fetch("/api/ops/analytics/trial-funnel", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/ops/billing/admin/revenue", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      setTrial((trialRes as { funnel?: TrialFunnel }).funnel ?? null);
      setRev((revRes as { summary?: RevenueSummary }).summary ?? {});
      if (
        (typeof trialRes === "object" && trialRes !== null && (trialRes as Record<string, unknown>).ok === false) ||
        (typeof revRes === "object" && revRes !== null && (revRes as Record<string, unknown>).ok === false)
      ) {
        setStatus("error");
        const te =
          typeof trialRes === "object" && trialRes !== null ? (trialRes as Record<string, unknown>).error : undefined;
        const re = typeof revRes === "object" && revRes !== null ? (revRes as Record<string, unknown>).error : undefined;
        setErrMsg(String(te || re || "Upstream error"));
        return;
      }
      setStatus("success");
    };
    void load();
  }, []);

  const badges = useMemo(() => {
    return [
      { label: "عيادات نشطة", value: Number(rev.active_clinics || 0) },
      { label: "عيادات تجريبية", value: Number(rev.trial_clinics || 0) },
      { label: "عيادات مقفلة", value: Number(rev.locked_clinics || 0) },
      { label: "طلبات معلّقة", value: Number(rev.pending_requests || 0) },
      { label: "طلبات متأخرة", value: Number(rev.overdue_requests || 0) },
    ];
  }, [rev]);

  return (
    <div className="flex flex-col gap-cg-5">
      <header className="flex flex-wrap items-end justify-between gap-cg-3">
        <div>
          <p className="text-ds-body text-muted-foreground">المنصة</p>
          <h1 className="text-ds-h1 font-semibold tracking-tight">النمو</h1>
        </div>
        <Badge variant="secondary">مرحلة 1</Badge>
      </header>

      {status === "loading" ? <TableSkeleton rows={6} /> : null}
      {status === "error" ? <ErrorState title="تعذر تحميل النمو" description={errMsg} onRetry={() => window.location.reload()} /> : null}

      <div className="flex flex-wrap gap-cg-2">
        {badges.map((b) => (
          <Badge key={b.label} variant="outline">
            {b.label}: {b.value}
          </Badge>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-cg-4">
        <p className="text-ds-body text-muted-foreground">مسار التجربة (آخر 24 ساعة)</p>
        {trial ? (
          <div className="mt-cg-3 grid gap-cg-2 text-ds-body md:grid-cols-6">
            <div className="rounded-xl border border-border/60 p-cg-2">بداية: <span className="font-semibold">{trial.started}</span></div>
            <div className="rounded-xl border border-border/60 p-cg-2">خطوة 1: <span className="font-semibold">{trial.step_1}</span></div>
            <div className="rounded-xl border border-border/60 p-cg-2">خطوة 2: <span className="font-semibold">{trial.step_2}</span></div>
            <div className="rounded-xl border border-border/60 p-cg-2">خطوة 3: <span className="font-semibold">{trial.step_3}</span></div>
            <div className="rounded-xl border border-border/60 p-cg-2">إرسال: <span className="font-semibold">{trial.submitted}</span></div>
            <div className="rounded-xl border border-border/60 p-cg-2">نجاح: <span className="font-semibold">{trial.success}</span></div>
          </div>
        ) : (
          <p className="mt-cg-2 text-ds-body text-muted-foreground">بيانات التجربة غير متاحة الآن.</p>
        )}
      </div>
    </div>
  );
}

