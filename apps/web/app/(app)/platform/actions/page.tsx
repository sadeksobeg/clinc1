"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState, EmptyState } from "@/components/platform/AsyncState";
import { TableSkeleton, TableToolbar } from "@/components/platform/TableSkeleton";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useSafetyDialog, type RiskLevel } from "@/components/platform/SafetyDialogProvider";
import { usePlatformPerms } from "@/hooks/usePlatformPerms";
import type { ApiResponse } from "@/lib/api-response";
import { hasPerm } from "@/lib/platform-perms";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ActionVerifyResult = {
  verification_status?: string;
  success?: boolean;
  metrics_after?: Record<string, unknown>;
};

type ActionRow = {
  id: number;
  action_type: string;
  target_type: string;
  target_id: number | null;
  clinic_id: number | null;
  clinic_name?: string | null;
  incident_id: number | null;
  decision_id: number | null;
  status: "pending" | "running" | "success" | "failed" | "rolled_back";
  error?: string | null;
  created_at: string;
};

export default function PlatformActionsPage() {
  const action = useAsyncAction();
  const safety = useSafetyDialog();
  const permsQ = usePlatformPerms();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [resultOpen, setResultOpen] = useState(false);
  const [resultActionId, setResultActionId] = useState<number | null>(null);

  const actionsQ = useQuery({
    queryKey: ["actions"],
    queryFn: async () => {
      const res = await fetch("/api/platform/actions?limit=120", { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<{ ok: true; actions: ActionRow[] }> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل actions.");
      return Array.isArray(out.data.actions) ? out.data.actions : [];
    },
  });

  const status = actionsQ.isLoading ? "loading" : actionsQ.isError ? "error" : "success";
  const errMsg = actionsQ.error instanceof Error ? actionsQ.error.message : "تعذر الاتصال بالشبكة.";
  const rows = actionsQ.data ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        String(r.action_type || "").toLowerCase().includes(q) ||
        String(r.status || "").toLowerCase().includes(q) ||
        String(r.target_type || "").toLowerCase().includes(q) ||
        String(r.clinic_name || "").toLowerCase().includes(q) ||
        String(r.clinic_id || "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter]);

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)).filter((n) => Number.isFinite(n) && n > 0), [selected]);
  const visibleIds = useMemo(() => filtered.slice(0, 120).map((r) => r.id), [filtered]);
  const allVisibleSelected = useMemo(() => visibleIds.length > 0 && visibleIds.every((id) => selected[id]), [visibleIds, selected]);

  const resultsQ = useQuery({
    queryKey: ["action-result", resultActionId],
    enabled: resultOpen && Boolean(resultActionId),
    queryFn: async () => {
      const id = Number(resultActionId || 0);
      const res = await fetch(`/api/platform/actions/${id}/results`, { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<{ result: ActionVerifyResult | null }> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل نتيجة التحقق.");
      return out.data.result ?? null;
    },
  });

  return (
    <div className="flex flex-col gap-cg-5">
      <PlatformPageHeader
        title="الإجراءات"
        right={<Badge variant="secondary">{status === "loading" ? "جارٍ التحميل..." : `العدد=${rows.length}`}</Badge>}
      />

      {status === "loading" ? <TableSkeleton rows={10} /> : null}
      {status === "error" ? <ErrorState title="تعذر تحميل الإجراءات" description={errMsg} onRetry={() => void actionsQ.refetch()} /> : null}
      {status === "success" && rows.length === 0 ? (
        <EmptyState
          title="لا توجد إجراءات"
          description="لا توجد إجراءات حالياً. ابدأ بإنشاء إجراء (ثم تنفيذ/تحقق) أو وافق على قرار يولّد إجراء."
          actionLabel="إنشاء إجراء"
          onAction={() => (window.location.href = "/platform/actions/create")}
        />
      ) : null}

      {status === "success" && rows.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-cg-4">
          <TableToolbar
            title="آخر الإجراءات"
            subtitle="إنشاء + تنفيذ + تحقق"
            right={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث بالنوع/الحالة/العيادة" className="w-72" />}
          />
          <div className="mt-cg-3 flex flex-wrap gap-cg-2">
            <Button asChild size="sm">
              <Link href="/platform/actions/create">إنشاء إجراء</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => void actionsQ.refetch()}>
              تحديث
            </Button>
          </div>
          <div className="mt-cg-3 flex flex-wrap items-center justify-between gap-cg-2">
            <label className="flex select-none items-center gap-cg-2 text-ds-body text-muted-foreground">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) => {
                  const next = { ...selected };
                  for (const id of visibleIds) next[id] = e.target.checked;
                  setSelected(next);
                }}
              />
              تحديد الكل (المعروض)
            </label>
            <div className="flex flex-wrap items-center gap-cg-2">
              <Badge variant="secondary">المحدد={selectedIds.length}</Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={action.busy || selectedIds.length === 0 || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "action.execute")}
                onClick={() =>
                  void action.run(
                    async (signal) => {
                      const prompt = await safety.askReason({
                        title: "تنفيذ جماعي",
                        description: `تنفيذ الإجراءات المعلّقة لعدد ${selectedIds.length} صف.`,
                        reasonPlaceholder: "سبب التنفيذ (مطلوب)",
                        minReasonLen: 5,
                        riskLevel: "high",
                        confirmLabel: "تنفيذ",
                      });
                      if (!prompt.ok) return null;
                      const reason = prompt.reason;
                      // execute only pending; do sequential to avoid burst
                      for (const id of selectedIds) {
                        const row = rows.find((x) => x.id === id);
                        if (!row || row.status !== "pending") continue;
                        const res = await fetch(`/api/platform/actions/${id}/execute`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ reason }),
                          signal,
                        });
                        const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                        if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : `Execute failed for #${id}`);
                      }
                      setSelected({});
                      await actionsQ.refetch();
                      return true;
                    },
                    { successToast: "تم طلب التنفيذ" },
                  )
                }
              >
                تنفيذ جماعي
              </Button>
            </div>
          </div>
          <div className="mt-cg-3 flex flex-col gap-cg-2 text-ds-body">
            {filtered.slice(0, 120).map((r) => (
              <div key={r.id} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                <div className="flex flex-wrap items-start justify-between gap-cg-2">
                  <div>
                    <div className="flex items-center gap-cg-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[r.id])}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                      />
                      <p className="font-medium">
                        #{r.id} — {r.action_type}
                      </p>
                    </div>
                    <p className="text-ds-small text-muted-foreground">
                      target={r.target_type}
                      {r.target_id ? `#${r.target_id}` : ""} • clinic=
                      {r.clinic_id ? `${r.clinic_name || "عيادة"} (#${r.clinic_id})` : "عام"} • الحالة={r.status}
                    </p>
                    {r.error ? <p className="mt-cg-1 text-ds-small text-danger">error: {r.error}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-cg-2">
                    <Badge variant="outline">{r.status}</Badge>
                    <Badge variant="outline">{r.target_type}</Badge>
                  </div>
                </div>
                <div className="mt-cg-2 flex flex-wrap gap-cg-2">
                  {r.clinic_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/platform/clinics/${r.clinic_id}?tab=overview`}>فتح مركز العيادة</Link>
                    </Button>
                  ) : null}
                  {r.incident_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/platform/incidents">فتح الحوادث</Link>
                    </Button>
                  ) : null}
                  {r.decision_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/platform/decisions">فتح القرارات</Link>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy || r.status !== "pending" || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "action.execute")}
                    onClick={() =>
                      void action.run(
                        async (signal) => {
                          const risk: RiskLevel = r.action_type === "system.toggle_runtime_flag" ? "critical" : r.action_type === "clinic.suspend" ? "high" : "medium";
                          const prompt = await safety.askReason({
                            title: "تنفيذ إجراء",
                            description: `تنفيذ الإجراء #${r.id} (${r.action_type})؟`,
                            impact: r.clinic_id ? `العيادة: ${r.clinic_name || "عيادة"} (#${r.clinic_id})` : "تأثير عام محتمل.",
                            reasonPlaceholder: "سبب التنفيذ (مطلوب)",
                            minReasonLen: 5,
                            riskLevel: risk,
                            confirmLabel: "تنفيذ",
                          });
                          if (!prompt.ok) return null;
                          const reason = prompt.reason;
                          const res = await fetch(`/api/platform/actions/${r.id}/execute`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ reason }),
                            signal,
                          });
                          const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                          if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر التنفيذ.");
                          await actionsQ.refetch();
                          return true;
                        },
                        { successToast: "تم التنفيذ" },
                      )
                    }
                  >
                    تنفيذ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "action.read")}
                    onClick={() => {
                      setResultActionId(r.id);
                      setResultOpen(true);
                    }}
                  >
                    التحقق
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Dialog
        open={resultOpen}
        onOpenChange={(v) => {
          setResultOpen(v);
          if (!v) setResultActionId(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>نتيجة التحقق</DialogTitle>
            <DialogDescription>للإجراء #{resultActionId ?? "—"}</DialogDescription>
          </DialogHeader>
          {resultsQ.isLoading ? <TableSkeleton rows={3} /> : null}
          {resultsQ.isError ? (
            <ErrorState title="تعذر تحميل النتيجة" description={resultsQ.error instanceof Error ? resultsQ.error.message : ""} onRetry={() => void resultsQ.refetch()} />
          ) : null}
          {!resultsQ.isLoading && !resultsQ.isError ? (
            resultsQ.data ? (
              <div className="flex flex-col gap-cg-2 text-ds-body">
                <p>
                  الحالة: <Badge variant="outline">{String(resultsQ.data.verification_status || "")}</Badge>
                </p>
                <p>
                  النجاح: <Badge variant={resultsQ.data.success ? "secondary" : "danger"}>{String(Boolean(resultsQ.data.success))}</Badge>
                </p>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-cg-3 text-ds-small">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(resultsQ.data.metrics_after || {}, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <EmptyState title="لا توجد نتيجة بعد" description="نتيجة التحقق لم تُكتب بعد. شغّل worker:action-verify أو انتظر." />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

