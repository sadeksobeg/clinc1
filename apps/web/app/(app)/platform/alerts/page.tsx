"use client";

import { useEffect, useMemo, useState } from "react";
import { ErrorState } from "@/components/platform/AsyncState";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { TableSkeleton } from "@/components/platform/TableSkeleton";

type Health = {
  db_ok?: boolean;
  db_latency_ms?: number;
  whatsapp_send_runtime_disabled?: boolean;
  whatsapp_safety?: {
    circuit_failures_in_window: number;
    circuit_threshold: number;
  };
};

type Failures = {
  webhook_failures_24h?: number;
  reminder_failures_24h?: number;
  messaging_failures_24h?: number;
  dead_jobs_24h?: number;
};

type RevenueSummary = {
  overdue_requests?: number;
  pending_requests?: number;
  locked_clinics?: number;
  trial_clinics?: number;
};

export default function PlatformAlertsPage() {
  const [health, setHealth] = useState<Health>({});
  const [failures, setFailures] = useState<Failures>({});
  const [rev, setRev] = useState<RevenueSummary>({});
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      setErrMsg("");
      const [h, f, r] = await Promise.all([
        fetch("/api/ops/system/health", { cache: "no-store" }).then((x) => x.json()).catch(() => ({})),
        fetch("/api/ops/system/failures", { cache: "no-store" }).then((x) => x.json()).catch(() => ({})),
        fetch("/api/ops/billing/admin/revenue", { cache: "no-store" }).then((x) => x.json()).catch(() => ({})),
      ]);
      setHealth((h as { health?: Health }).health ?? {});
      setFailures((f as { failures?: Failures }).failures ?? {});
      setRev(((r as { summary?: RevenueSummary }).summary ?? {}) as RevenueSummary);
      if (
        (typeof h === "object" && h !== null && (h as Record<string, unknown>).ok === false) ||
        (typeof f === "object" && f !== null && (f as Record<string, unknown>).ok === false) ||
        (typeof r === "object" && r !== null && (r as Record<string, unknown>).ok === false)
      ) {
        setStatus("error");
        const he = typeof h === "object" && h !== null ? (h as Record<string, unknown>).error : undefined;
        const fe = typeof f === "object" && f !== null ? (f as Record<string, unknown>).error : undefined;
        const re = typeof r === "object" && r !== null ? (r as Record<string, unknown>).error : undefined;
        setErrMsg(String(he || fe || re || "Upstream error"));
        return;
      }
      setStatus("success");
    };
    void load();
  }, []);

  const alerts = useMemo(() => {
    const out: Array<{ kind: "critical" | "warning" | "info"; title: string; detail: string }> = [];
    if (health.db_ok === false) out.push({ kind: "critical", title: "DB unhealthy", detail: "db_ok=false" });
    if (Number(health.db_latency_ms || 0) > 800) out.push({ kind: "warning", title: "DB latency high", detail: `${Number(health.db_latency_ms || 0)}ms` });
    if (health.whatsapp_send_runtime_disabled) out.push({ kind: "warning", title: "WhatsApp sending disabled", detail: "runtime flag is ON" });
    if (health.whatsapp_safety && health.whatsapp_safety.circuit_failures_in_window >= health.whatsapp_safety.circuit_threshold) {
      out.push({
        kind: "critical",
        title: "WhatsApp circuit breaker risk",
        detail: `failures=${health.whatsapp_safety.circuit_failures_in_window} threshold=${health.whatsapp_safety.circuit_threshold}`,
      });
    }
    if (Number(failures.webhook_failures_24h || 0) > 0) out.push({ kind: "warning", title: "Billing webhook failures", detail: `${Number(failures.webhook_failures_24h || 0)} / 24h` });
    if (Number(failures.dead_jobs_24h || 0) > 0) out.push({ kind: "warning", title: "Dead jobs", detail: `${Number(failures.dead_jobs_24h || 0)} / 24h` });
    if (Number(rev.overdue_requests || 0) > 0) out.push({ kind: "warning", title: "Overdue payment requests", detail: `${Number(rev.overdue_requests || 0)}` });
    if (Number(rev.locked_clinics || 0) > 0) out.push({ kind: "info", title: "Locked clinics", detail: `${Number(rev.locked_clinics || 0)}` });
    if (out.length === 0) out.push({ kind: "info", title: "No alerts", detail: "System looks stable" });
    return out;
  }, [health, failures, rev]);

  return (
    <div className="flex flex-col gap-cg-5">
      <PlatformPageHeader title="مركز التنبيهات" />
      {status === "loading" ? <TableSkeleton rows={6} /> : null}
      {status === "error" ? <ErrorState title="تعذر تحميل التنبيهات" description={errMsg} onRetry={() => window.location.reload()} /> : null}
      {status === "success" ? (
        <div className="flex flex-col gap-cg-2">
          {alerts.map((a, idx) => (
            <div key={idx} className="rounded-2xl border border-border bg-card p-cg-4">
              <p className="font-semibold">
                [{a.kind.toUpperCase()}] {a.title}
              </p>
              <p className="text-ds-body text-muted-foreground">{a.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

