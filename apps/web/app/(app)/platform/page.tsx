"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/platform/AsyncState";
import { TableSkeleton } from "@/components/platform/TableSkeleton";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { ApiResponse } from "@/lib/api-response";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function fetchFailMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const err = (json as Record<string, unknown>).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

type Summary = {
  active_clinics?: number;
  trial_clinics?: number;
  locked_clinics?: number;
  projected_mrr_usd?: number;
};

type SystemState = {
  global_status: "healthy" | "degraded" | "incident" | "maintenance";
  severity: number;
  active_incidents_count: number;
  critical_incidents_count: number;
  blast_radius?: number;
  user_impact_score?: number;
  confidence_score?: number;
  primary_cause?: string | null;
  components?: Record<string, "healthy" | "degraded" | "down">;
  last_evaluated_at?: string;
};

type IncidentRow = {
  id: number;
  clinic_id: number | null;
  clinic_name?: string | null;
  title: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "assigned" | "resolved";
  created_at: string;
};

type DecisionRow = {
  id: number;
  decision_type: string;
  trigger_source: string;
  clinic_id: number | null;
  clinic_name?: string | null;
  status: "pending" | "approved" | "executed" | "cancelled";
  created_at: string;
};

type ActionRow = {
  id: number;
  action_type: string;
  clinic_id: number | null;
  clinic_name?: string | null;
  status: "pending" | "running" | "success" | "failed" | "rolled_back";
  created_at: string;
};

type OutcomeRow = {
  incident_type: string;
  action_type: string;
  success_rate: number;
  sample_size: number;
  updated_at: string;
};

export default function PlatformHomePage() {
  const action = useAsyncAction();
  const [bootstrapClinicId, setBootstrapClinicId] = useState<string>("1");

  const revenueQ = useQuery({
    queryKey: ["revenue-summary"],
    queryFn: async () => {
      const revRes = await fetch("/api/ops/billing/admin/revenue", { cache: "no-store" });
      const json = (await revRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!revRes.ok || !json || json.ok !== true) throw new Error(fetchFailMessage(json, "تعذر تحميل بيانات المنصة."));
      const s = json.summary;
      return (isRecord(s) ? s : {}) as Summary;
    },
  });

  const systemQ = useQuery({
    queryKey: ["system-state"],
    queryFn: async () => {
      const sysRes = await fetch("/api/platform/system/state?ttl_ms=20000", { cache: "no-store" });
      const sysJson = (await sysRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!sysRes.ok || !sysJson || sysJson.ok !== true) return null as SystemState | null;
      const payload = sysJson.data;
      if (!isRecord(payload)) return null;
      const state = payload.state;
      return (isRecord(state) ? state : payload) as SystemState;
    },
  });

  const status = revenueQ.isLoading ? "loading" : revenueQ.isError ? "error" : "success";
  const summary = revenueQ.data ?? {};
  const system = systemQ.data ?? null;
  const errMsg = revenueQ.error instanceof Error ? revenueQ.error.message : "تعذر الاتصال بالشبكة.";

  const golden = useMemo(() => {
    if (!system) return null;
    const blast = Number(system.blast_radius || 0);
    const impact = Number(system.user_impact_score || 0);
    const conf = Number(system.confidence_score || 0);
    return { blast, impact, conf };
  }, [system]);

  const incidentsQ = useQuery({
    queryKey: ["incidents", { limit: 20 }],
    queryFn: async () => {
      const res = await fetch("/api/platform/incidents?limit=20", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(fetchFailMessage(json, "Incidents load failed"));
      const d = json.data;
      const list = isRecord(d) && Array.isArray(d.incidents) ? d.incidents : [];
      return list as IncidentRow[];
    },
  });

  const decisionsQ = useQuery({
    queryKey: ["decisions", { limit: 20 }],
    queryFn: async () => {
      const res = await fetch("/api/platform/decisions?limit=20", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(fetchFailMessage(json, "Decisions load failed"));
      const d = json.data;
      const list = isRecord(d) && Array.isArray(d.decisions) ? d.decisions : [];
      return list as DecisionRow[];
    },
  });

  const actionsQ = useQuery({
    queryKey: ["actions", { limit: 20 }],
    queryFn: async () => {
      const res = await fetch("/api/platform/actions?limit=20", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(fetchFailMessage(json, "Actions load failed"));
      const d = json.data;
      const list = isRecord(d) && Array.isArray(d.actions) ? d.actions : [];
      return list as ActionRow[];
    },
  });

  const outcomesQ = useQuery({
    queryKey: ["outcomes", { limit: 8 }],
    queryFn: async () => {
      const res = await fetch("/api/platform/outcomes?limit=8", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !json || json.ok !== true) return [] as OutcomeRow[];
      const d = json.data;
      const list = isRecord(d) && Array.isArray(d.outcomes) ? d.outcomes : [];
      return list as OutcomeRow[];
    },
  });

  const triage = useMemo(() => {
    const incidents = (incidentsQ.data ?? []).filter((x) => x.status !== "resolved");
    const criticalIncidents = incidents.filter((x) => x.severity === "critical").slice(0, 5);
    const openIncidents = incidents.slice(0, 5);

    const decisions = (decisionsQ.data ?? []).slice(0, 20);
    const pendingDecisions = decisions.filter((x) => x.status === "pending").slice(0, 5);

    const actions = (actionsQ.data ?? []).slice(0, 20);
    const runningActions = actions.filter((x) => x.status === "running").slice(0, 5);
    const pendingActions = actions.filter((x) => x.status === "pending").slice(0, 5);

    return { criticalIncidents, openIncidents, pendingDecisions, runningActions, pendingActions };
  }, [incidentsQ.data, decisionsQ.data, actionsQ.data]);

  return (
    <div className="flex flex-col gap-cg-5">
      <header className="flex flex-wrap items-end justify-between gap-cg-3">
        <div>
          <p className="text-ds-body text-muted-foreground">نظام المنصة</p>
          <h1 className="text-ds-h1 font-semibold tracking-tight">لوحة القيادة</h1>
          <p className="mt-cg-1 text-ds-body text-muted-foreground">عرض تشغيلي: الحوادث ← القرارات ← الإجراءات</p>
        </div>
        <div className="flex flex-wrap items-center gap-cg-2">
          <Badge variant="secondary">platform</Badge>
          <Button size="sm" variant="outline" onClick={() => void Promise.all([revenueQ.refetch(), systemQ.refetch(), incidentsQ.refetch(), decisionsQ.refetch(), actionsQ.refetch()])}>
            تحديث
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-cg-3">
          <div>
            <CardTitle className="text-ds-h3">بدء التشغيل (بيئة جديدة)</CardTitle>
            <p className="mt-cg-1 text-ds-body text-muted-foreground">
              إذا كانت صفحات الحوادث/القرارات/الإجراءات فارغة، أنشئ مجموعة سجلات صغيرة لبدء اختبار النظام End-to-End.
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-cg-2">
          <div className="min-w-[220px]">
            <p className="mb-cg-1 text-ds-body text-muted-foreground">رقم العيادة</p>
            <Input value={bootstrapClinicId} onChange={(e) => setBootstrapClinicId(e.target.value)} placeholder="مثال: 1" />
          </div>
          <Button
            disabled={action.busy}
            onClick={() =>
              void action.run(
                async (signal) => {
                  const clinic_id = Number(bootstrapClinicId || 0);
                  const res = await fetch("/api/platform/bootstrap", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clinic_id }),
                    signal,
                  });
                  const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                  if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر إنشاء بيانات التشغيل.");
                  await Promise.all([incidentsQ.refetch(), decisionsQ.refetch(), actionsQ.refetch(), outcomesQ.refetch()]).catch(() => undefined);
                  return out.data;
                },
                { successToast: "تم إنشاء بيانات تشغيل" },
              )
            }
          >
            إنشاء بيانات تشغيل
          </Button>
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => void Promise.all([incidentsQ.refetch(), decisionsQ.refetch(), actionsQ.refetch()]).catch(() => undefined)}
          >
            تحديث القوائم
          </Button>
        </CardContent>
      </Card>

      {system ? (
        <div className="rounded-2xl border border-border bg-card p-cg-4">
          <div className="flex flex-wrap items-start justify-between gap-cg-3">
            <div>
              <p className="text-ds-small text-muted-foreground">System state</p>
              <p className="text-ds-h2 font-semibold">
                {system.global_status.toUpperCase()}{" "}
                <span className="text-ds-body text-muted-foreground">severity={Number(system.severity || 0)}</span>
              </p>
              <p className="text-ds-small text-muted-foreground">
                الحوادث: نشطة={Number(system.active_incidents_count || 0)} • حرجة={Number(system.critical_incidents_count || 0)}
              </p>
              {golden ? (
                <p className="mt-cg-1 text-ds-small text-muted-foreground">
                  blast radius={golden.blast} • user impact={golden.impact} • confidence={golden.conf.toFixed(2)}
                  {system.primary_cause ? ` • cause=${String(system.primary_cause)}` : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-cg-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/platform/incidents">الحوادث</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/platform/decisions">القرارات</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/platform/actions">الإجراءات</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/platform/actions/create">إنشاء إجراء</Link>
              </Button>
            </div>
          </div>

          <div className="mt-cg-3 grid gap-cg-2 md:grid-cols-4">
            {Object.entries(system.components || {}).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border/60 px-cg-3 py-cg-2 text-ds-body">
                <p className="text-ds-small text-muted-foreground">{k}</p>
                <p className="font-semibold">{String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {status === "loading" ? <TableSkeleton rows={4} /> : null}
      {status === "error" ? <ErrorState title="تعذر تحميل لوحة المنصة" description={errMsg} onRetry={() => void revenueQ.refetch()} /> : null}

      <div className="grid gap-cg-4 lg:grid-cols-3">
        <Card className="glass-card">
          <CardHeader className="pb-cg-2">
            <CardTitle className="text-ds-body">الحوادث (فرز)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-cg-2 text-ds-body">
            <p className="text-ds-small text-muted-foreground">الحوادث الحرجة أولاً ثم أحدث الحوادث المفتوحة.</p>
            {incidentsQ.isLoading ? <TableSkeleton rows={3} /> : null}
            {incidentsQ.isError ? (
              <ErrorState title="تعذر تحميل الحوادث" description={incidentsQ.error instanceof Error ? incidentsQ.error.message : ""} onRetry={() => void incidentsQ.refetch()} />
            ) : null}
            {!incidentsQ.isLoading && !incidentsQ.isError ? (
              <div className="flex flex-col gap-cg-2">
                {(triage.criticalIncidents.length ? triage.criticalIncidents : triage.openIncidents).map((r) => (
                  <div key={r.id} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                    <div className="flex items-start justify-between gap-cg-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          #{r.id} — {r.title}
                        </p>
                        <p className="text-ds-small text-muted-foreground">
                          {r.clinic_id ? `${r.clinic_name || "Clinic"} (#${r.clinic_id})` : "global"} • {r.status} • {r.severity}
                        </p>
                      </div>
                      <Badge variant={r.severity === "critical" ? "danger" : r.severity === "warning" ? "warning" : "outline"}>{r.severity}</Badge>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-cg-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/platform/incidents">فتح الحوادث</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-cg-2">
            <CardTitle className="text-ds-body">القرارات (طابور)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-cg-2 text-ds-body">
            <p className="text-ds-small text-muted-foreground">القرارات المعلّقة أولاً.</p>
            {decisionsQ.isLoading ? <TableSkeleton rows={3} /> : null}
            {decisionsQ.isError ? (
              <ErrorState title="تعذر تحميل القرارات" description={decisionsQ.error instanceof Error ? decisionsQ.error.message : ""} onRetry={() => void decisionsQ.refetch()} />
            ) : null}
            {!decisionsQ.isLoading && !decisionsQ.isError ? (
              <div className="flex flex-col gap-cg-2">
                {(triage.pendingDecisions.length ? triage.pendingDecisions : (decisionsQ.data ?? []).slice(0, 5)).map((r) => (
                  <div key={r.id} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                    <div className="flex items-start justify-between gap-cg-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          #{r.id} — {r.decision_type}
                        </p>
                        <p className="text-ds-small text-muted-foreground">
                          {r.clinic_id ? `${r.clinic_name || "Clinic"} (#${r.clinic_id})` : "global"} • {r.status} • {r.trigger_source}
                        </p>
                      </div>
                      <Badge variant="outline">{r.status}</Badge>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-cg-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/platform/decisions">فتح القرارات</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-cg-2">
            <CardTitle className="text-ds-body">الإجراءات (تنفيذ)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-cg-2 text-ds-body">
            <p className="text-ds-small text-muted-foreground">التنفيذ الجاري ثم المعلّق.</p>
            {actionsQ.isLoading ? <TableSkeleton rows={3} /> : null}
            {actionsQ.isError ? (
              <ErrorState title="تعذر تحميل الإجراءات" description={actionsQ.error instanceof Error ? actionsQ.error.message : ""} onRetry={() => void actionsQ.refetch()} />
            ) : null}
            {!actionsQ.isLoading && !actionsQ.isError ? (
              <div className="flex flex-col gap-cg-2">
                {(triage.runningActions.length ? triage.runningActions : triage.pendingActions).map((r) => (
                  <div key={r.id} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                    <div className="flex items-start justify-between gap-cg-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          #{r.id} — {r.action_type}
                        </p>
                        <p className="text-ds-small text-muted-foreground">
                          {r.clinic_id ? `${r.clinic_name || "Clinic"} (#${r.clinic_id})` : "global"} • {r.status}
                        </p>
                      </div>
                      <Badge variant="outline">{r.status}</Badge>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-cg-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/platform/actions">فتح الإجراءات</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href="/platform/actions/create">إنشاء إجراء</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="glass-card lg:col-span-3">
          <CardHeader className="pb-cg-2">
            <CardTitle className="text-ds-body">التعلّم (نتائج)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-cg-2 text-ds-body">
            <p className="text-ds-small text-muted-foreground">ملخص من `platform_outcome_history`.</p>
            {outcomesQ.isLoading ? <TableSkeleton rows={2} /> : null}
            {!outcomesQ.isLoading ? (
              outcomesQ.data && outcomesQ.data.length ? (
                <div className="grid gap-cg-2 md:grid-cols-2">
                  {outcomesQ.data.slice(0, 8).map((o) => (
                    <div key={`${o.incident_type}-${o.action_type}`} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                      <p className="font-medium">{o.action_type}</p>
                      <p className="text-ds-small text-muted-foreground">
                        incident={o.incident_type} • success_rate={Number(o.success_rate || 0).toFixed(2)}% • n={Number(o.sample_size || 0)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-ds-body text-muted-foreground">لا توجد نتائج بعد.</p>
              )
            ) : null}
          </CardContent>
        </Card>
      </div>

      {status === "success" ? (
        <div className="grid gap-cg-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="pb-cg-2">
              <CardTitle className="text-ds-body">العيادات</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-cg-2 text-ds-body">
              <p className="text-muted-foreground">نظرة عامة على قاعدة العملاء.</p>
              <div className="flex flex-wrap gap-cg-2 text-ds-small">
                <Badge variant="secondary">Active: {Number(summary.active_clinics || 0)}</Badge>
                <Badge variant="outline">Trial: {Number(summary.trial_clinics || 0)}</Badge>
                <Badge variant="outline">Locked: {Number(summary.locked_clinics || 0)}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-cg-2">
              <CardTitle className="text-ds-body">الإيرادات</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-cg-2 text-ds-body">
              <p className="text-muted-foreground">Projected MRR (local ops).</p>
              <p className="text-ds-h3 font-semibold">{Number(summary.projected_mrr_usd || 0).toFixed(0)}$</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-cg-2">
              <CardTitle className="text-ds-body">الدعم</CardTitle>
            </CardHeader>
            <CardContent className="text-ds-body text-muted-foreground">طابور الدعم العالمي.</CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-cg-2">
              <CardTitle className="text-ds-body">البحث</CardTitle>
            </CardHeader>
            <CardContent className="text-ds-body text-muted-foreground">بحث عبر جميع العيادات.</CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-cg-2">
        <Button asChild variant="outline">
          <Link href="/platform/clinics">العيادات</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/platform/revenue">الإيرادات</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/platform/support">الدعم</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/platform/search">بحث</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/platform/whatsapp-routing">توجيه واتساب</Link>
        </Button>
        <Button asChild>
          <Link href="/ops-center">مركز العمليات</Link>
        </Button>
      </div>
    </div>
  );
}

