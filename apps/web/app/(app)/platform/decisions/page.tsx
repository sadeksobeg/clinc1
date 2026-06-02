"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, EmptyState } from "@/components/platform/AsyncState";
import { TableSkeleton, TableToolbar } from "@/components/platform/TableSkeleton";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useSafetyDialog } from "@/components/platform/SafetyDialogProvider";
import { usePlatformPerms } from "@/hooks/usePlatformPerms";
import type { ApiResponse } from "@/lib/api-response";
import { hasPerm } from "@/lib/platform-perms";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type DecisionRow = {
  id: number;
  decision_type: string;
  trigger_source: string;
  clinic_id: number | null;
  clinic_name?: string | null;
  incident_id: number | null;
  status: "pending" | "approved" | "executed" | "cancelled";
  created_at: string;
};

export default function PlatformDecisionsPage() {
  const action = useAsyncAction();
  const safety = useSafetyDialog();
  const permsQ = usePlatformPerms();
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createClinicId, setCreateClinicId] = useState<string>("");
  const [createIncidentId, setCreateIncidentId] = useState<string>("");
  const [createType, setCreateType] = useState<string>("manual.review_needed");
  const [createSource, setCreateSource] = useState<string>("manual");
  const [createNote, setCreateNote] = useState<string>("");

  const decisionsQ = useQuery({
    queryKey: ["decisions"],
    queryFn: async () => {
      const res = await fetch("/api/platform/decisions?limit=120", { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<{ ok: true; decisions: DecisionRow[] }> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل decisions.");
      return Array.isArray(out.data.decisions) ? out.data.decisions : [];
    },
  });

  const status = decisionsQ.isLoading ? "loading" : decisionsQ.isError ? "error" : "success";
  const errMsg = decisionsQ.error instanceof Error ? decisionsQ.error.message : "تعذر الاتصال بالشبكة.";
  const rows = decisionsQ.data ?? [];
  const canCreate = hasPerm(permsQ.data, "decision.write");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        String(r.decision_type || "").toLowerCase().includes(q) ||
        String(r.status || "").toLowerCase().includes(q) ||
        String(r.trigger_source || "").toLowerCase().includes(q) ||
        String(r.clinic_name || "").toLowerCase().includes(q) ||
        String(r.clinic_id || "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter]);

  return (
    <div className="flex flex-col gap-cg-5">
      <PlatformPageHeader
        title="القرارات"
        right={
        <div className="flex flex-wrap items-center gap-cg-2">
          {canCreate ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">إنشاء قرار</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إنشاء قرار (يدوي)</DialogTitle>
                  <DialogDescription>يساعدك على بدء التشغيل وملء شاشة القرارات عندما لا يوجد Decisions بعد.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-cg-3">
                  <div className="grid gap-cg-2 md:grid-cols-2">
                    <div className="flex flex-col gap-cg-1">
                      <p className="text-ds-body text-muted-foreground">رقم العيادة (اختياري)</p>
                      <Input value={createClinicId} onChange={(e) => setCreateClinicId(e.target.value)} placeholder="مثال: 1" />
                    </div>
                    <div className="flex flex-col gap-cg-1">
                      <p className="text-ds-body text-muted-foreground">رقم الحادث (اختياري)</p>
                      <Input value={createIncidentId} onChange={(e) => setCreateIncidentId(e.target.value)} placeholder="مثال: 12" />
                    </div>
                  </div>

                  <div className="grid gap-cg-2 md:grid-cols-2">
                    <div className="flex flex-col gap-cg-1">
                      <p className="text-ds-body text-muted-foreground">نوع القرار</p>
                      <Input value={createType} onChange={(e) => setCreateType(e.target.value)} placeholder="manual.review_needed" />
                    </div>
                    <div className="flex flex-col gap-cg-1">
                      <p className="text-ds-body text-muted-foreground">المصدر</p>
                      <Input value={createSource} onChange={(e) => setCreateSource(e.target.value)} placeholder="manual" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-cg-1">
                    <p className="text-ds-body text-muted-foreground">ملاحظة</p>
                    <Textarea value={createNote} onChange={(e) => setCreateNote(e.target.value)} placeholder="اكتب سبب/سياق القرار..." />
                  </div>

                  <div className="flex flex-wrap justify-end gap-cg-2">
                    <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={action.busy}>
                      إلغاء
                    </Button>
                    <Button
                      onClick={() =>
                        void action.run(
                          async (signal) => {
                            const clinic_id = Number(createClinicId || 0);
                            const incident_id = Number(createIncidentId || 0);
                            const res = await fetch("/api/platform/decisions", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                clinic_id: Number.isFinite(clinic_id) && clinic_id > 0 ? clinic_id : undefined,
                                incident_id: Number.isFinite(incident_id) && incident_id > 0 ? incident_id : undefined,
                                decision_type: createType.trim() || "manual.review_needed",
                                trigger_source: createSource.trim() || "manual",
                                context: { note: createNote.trim() || undefined },
                              }),
                              signal,
                            });
                            const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                            if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر إنشاء القرار.");
                            setCreateOpen(false);
                            void decisionsQ.refetch();
                            return out.data;
                          },
                          { successToast: "تم إنشاء القرار" },
                        )
                      }
                      disabled={action.busy}
                    >
                      إنشاء
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
          <Badge variant="secondary">{status === "loading" ? "جارٍ التحميل..." : `العدد=${rows.length}`}</Badge>
        </div>
        }
      />

      {status === "loading" ? <TableSkeleton rows={10} /> : null}
      {status === "error" ? <ErrorState title="تعذر تحميل القرارات" description={errMsg} onRetry={() => void decisionsQ.refetch()} /> : null}
      {status === "success" && rows.length === 0 ? (
        <EmptyState
          title="لا توجد قرارات"
          description="لا توجد قرارات حالياً. يمكنك إنشاء قرار يدويًا لبدء التشغيل، أو ابدأ بإنشاء حادث/إجراء."
          actionLabel={canCreate ? "إنشاء قرار" : undefined}
          onAction={canCreate ? () => setCreateOpen(true) : undefined}
        />
      ) : null}

      {status === "success" && rows.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-cg-4">
          <TableToolbar
            title="آخر القرارات"
            subtitle="قائمة انتظار + موافقة"
            right={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث بالنوع/الحالة/العيادة" className="w-72" />}
          />
          <div className="mt-cg-3 flex flex-wrap gap-cg-2">
            <Button size="sm" variant="outline" onClick={() => void decisionsQ.refetch()}>
              تحديث
            </Button>
          </div>
          <div className="mt-cg-3 flex flex-col gap-cg-2 text-ds-body">
            {filtered.slice(0, 120).map((r) => (
              <div key={r.id} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                <div className="flex flex-wrap items-start justify-between gap-cg-2">
                  <div>
                    <p className="font-medium">
                      #{r.id} — {r.decision_type}
                    </p>
                    <p className="text-ds-small text-muted-foreground">
                      العيادة: {r.clinic_id ? `${r.clinic_name || "عيادة"} (#${r.clinic_id})` : "عام"} • الحالة: {r.status} • المصدر:{" "}
                      {r.trigger_source}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-cg-2">
                    <Badge variant="outline">{r.status}</Badge>
                    <Badge variant="outline">{r.trigger_source}</Badge>
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy || r.status !== "pending" || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "decision.approve")}
                    onClick={() =>
                      void action.run(
                        async (signal) => {
                          const prompt = await safety.askReason({
                            title: "الموافقة على القرار",
                            description: `الموافقة على القرار #${r.id} (${r.decision_type})؟`,
                            impact: r.clinic_id ? `العيادة: ${r.clinic_name || "عيادة"} (#${r.clinic_id})` : "قرار عام.",
                            reasonLabel: "ملاحظة (اختياري)",
                            reasonPlaceholder: "ملاحظة اختيارية",
                            minReasonLen: 0,
                            riskLevel: "medium",
                            confirmLabel: "موافقة",
                          });
                          if (!prompt.ok) return null;
                          const note = prompt.reason.trim() ? prompt.reason : undefined;
                          const res = await fetch(`/api/platform/decisions/${r.id}/approve`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ note }),
                            signal,
                          });
                          const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                          if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر الموافقة.");
                          await decisionsQ.refetch();
                          return true;
                        },
                        { successToast: "تمت الموافقة" },
                      )
                    }
                  >
                    موافقة
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

