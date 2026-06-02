"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, EmptyState } from "@/components/platform/AsyncState";
import { TableSkeleton, TableToolbar } from "@/components/platform/TableSkeleton";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useSafetyDialog } from "@/components/platform/SafetyDialogProvider";
import { usePlatformPerms } from "@/hooks/usePlatformPerms";
import type { ApiResponse } from "@/lib/api-response";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hasPerm } from "@/lib/platform-perms";

type IncidentRow = {
  id: number;
  clinic_id: number | null;
  clinic_name?: string | null;
  title: string;
  description?: string | null;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "assigned" | "resolved";
  created_at: string;
};

export default function PlatformIncidentsPage() {
  const action = useAsyncAction();
  const safety = useSafetyDialog();
  const permsQ = usePlatformPerms();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createClinicId, setCreateClinicId] = useState<string>("");
  const [createTitle, setCreateTitle] = useState<string>("");
  const [createSeverity, setCreateSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [createDescription, setCreateDescription] = useState<string>("");

  async function load() {
    setStatus("loading");
    setErrMsg("");
    try {
      const res = await fetch("/api/platform/incidents?limit=120", { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<{ ok: true; incidents: IncidentRow[] }> | null;
      if (!res.ok || !out || out.ok !== true) {
        setStatus("error");
        setErrMsg(out && out.ok === false ? out.error.message : "تعذر تحميل incidents.");
        return;
      }
      const list = Array.isArray(out.data.incidents) ? out.data.incidents : [];
      setRows(list);
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "تعذر الاتصال بالشبكة.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        String(r.title || "").toLowerCase().includes(q) ||
        String(r.status || "").toLowerCase().includes(q) ||
        String(r.severity || "").toLowerCase().includes(q) ||
        String(r.clinic_name || "").toLowerCase().includes(q) ||
        String(r.clinic_id || "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter]);

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)).filter((n) => Number.isFinite(n) && n > 0), [selected]);
  const visibleIds = useMemo(() => filtered.slice(0, 120).map((r) => r.id), [filtered]);
  const allVisibleSelected = useMemo(() => visibleIds.length > 0 && visibleIds.every((id) => selected[id]), [visibleIds, selected]);
  const canCreate = hasPerm(permsQ.data, "incidents.write");

  return (
    <div className="flex flex-col gap-cg-5">
      <PlatformPageHeader
        title="الحوادث"
        right={
        <div className="flex flex-wrap items-center gap-cg-2">
          {canCreate ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">إنشاء حادث</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إنشاء حادث</DialogTitle>
                  <DialogDescription>الحوادث تساعدك على توثيق المشكلة وبدء مسار القرار/الإجراء.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-cg-3">
                  <div className="grid gap-cg-2 md:grid-cols-2">
                    <div className="flex flex-col gap-cg-1">
                      <p className="text-ds-body text-muted-foreground">رقم العيادة (اختياري)</p>
                      <Input value={createClinicId} onChange={(e) => setCreateClinicId(e.target.value)} placeholder="مثال: 1" />
                    </div>
                    <div className="flex flex-col gap-cg-1">
                      <p className="text-ds-body text-muted-foreground">الخطورة</p>
                      <Select value={createSeverity} onValueChange={(v) => setCreateSeverity(v as IncidentRow["severity"])}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">معلومة</SelectItem>
                          <SelectItem value="warning">تحذير</SelectItem>
                          <SelectItem value="critical">حرج</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-cg-1">
                    <p className="text-ds-body text-muted-foreground">العنوان</p>
                    <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="مثال: توقف إرسال واتساب" />
                  </div>

                  <div className="flex flex-col gap-cg-1">
                    <p className="text-ds-body text-muted-foreground">الوصف (اختياري)</p>
                    <Textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder="اشرح المشكلة باختصار..." />
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
                            const res = await fetch("/api/platform/incidents", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                clinic_id: Number.isFinite(clinic_id) && clinic_id > 0 ? clinic_id : undefined,
                                title: createTitle.trim() || "Incident",
                                description: createDescription.trim() || undefined,
                                severity: createSeverity,
                              }),
                              signal,
                            });
                            const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                            if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر إنشاء الحادث.");
                            setCreateOpen(false);
                            setCreateTitle("");
                            setCreateDescription("");
                            void load();
                            return out.data;
                          },
                          { successToast: "تم إنشاء الحادث" },
                        )
                      }
                      disabled={action.busy || createTitle.trim().length < 3}
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
      {status === "error" ? <ErrorState title="تعذر تحميل الحوادث" description={errMsg} onRetry={() => void load()} /> : null}

      {status === "success" && rows.length === 0 ? (
        <EmptyState
          title="لا توجد حوادث"
          description="لا توجد حوادث حالياً. أنشئ أول حادث لتبدأ مسار الإدارة (قرار → إجراء → تحقق)."
          actionLabel={canCreate ? "إنشاء حادث" : undefined}
          onAction={canCreate ? () => setCreateOpen(true) : undefined}
        />
      ) : null}

      {status === "success" && rows.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-cg-4">
          <TableToolbar
            title="آخر الحوادث"
            subtitle="إقرار / حل • دعم إجراءات جماعية"
            right={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث بالعنوان/العيادة/الحالة/الخطورة" className="w-72" />}
          />

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
                disabled={action.busy || selectedIds.length === 0 || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "incident.ack")}
                onClick={() =>
                  void action.run(
                    async (signal) => {
                      // sequential to avoid burst
                      for (const id of selectedIds) {
                        const res = await fetch(`/api/platform/incidents/${id}/ack`, { method: "POST", signal });
                        const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                        if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : `Ack failed for #${id}`);
                      }
                      setSelected({});
                      await load();
                      return true;
                    },
                { successToast: "تم الإقرار جماعيًا" },
                  )
                }
              >
                إقرار جماعي
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={action.busy || selectedIds.length === 0 || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "incident.resolve")}
                onClick={() =>
                  void action.run(
                    async (signal) => {
                      const prompt = await safety.askReason({
                        title: "Bulk resolve",
                        description: `Resolve ${selectedIds.length} incident(s).`,
                        reasonLabel: "Resolution",
                        reasonPlaceholder: "Write a short resolution",
                        minReasonLen: 0,
                        riskLevel: "medium",
                        confirmLabel: "Resolve",
                      });
                      if (!prompt.ok) return null;
                      const resolution = prompt.reason.trim() ? prompt.reason : undefined;
                      for (const id of selectedIds) {
                        const res = await fetch(`/api/platform/incidents/${id}/resolve`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ resolution }),
                          signal,
                        });
                        const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                        if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : `Resolve failed for #${id}`);
                      }
                      setSelected({});
                      await load();
                      return true;
                    },
                    { successToast: "Bulk resolved" },
                  )
                }
              >
                Bulk Resolve
              </Button>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                تحديث
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
                        #{r.id} — {r.title}
                      </p>
                    </div>
                    <p className="text-ds-small text-muted-foreground">
                      العيادة: {r.clinic_id ? `${r.clinic_name || "عيادة"} (#${r.clinic_id})` : "عام"} • الحالة: {r.status} • الخطورة: {r.severity}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-cg-2">
                    <Badge variant="outline">{r.status}</Badge>
                    <Badge variant={r.severity === "critical" ? "danger" : r.severity === "warning" ? "warning" : "outline"}>{r.severity}</Badge>
                  </div>
                </div>

                {r.description ? <p className="mt-cg-2 text-ds-body text-muted-foreground">{r.description}</p> : null}

                <div className="mt-cg-2 flex flex-wrap gap-cg-2">
                  {r.clinic_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/platform/clinics/${r.clinic_id}?tab=overview`}>فتح مركز العيادة</Link>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy || r.status === "resolved" || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "incident.ack")}
                    onClick={() =>
                      void action.run(async (signal) => {
                        const res = await fetch(`/api/platform/incidents/${r.id}/ack`, { method: "POST", signal });
                        const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                        if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر الإقرار.");
                        await load();
                        return true;
                      }, { successToast: "تم الإقرار" })
                    }
                  >
                    إقرار
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy || r.status === "resolved" || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "incident.resolve")}
                    onClick={() =>
                      void action.run(async (signal) => {
                        const prompt = await safety.askReason({
                          title: "حل الحادثة",
                          description: `حل الحادثة #${r.id}؟`,
                          impact: r.clinic_id ? `العيادة: ${r.clinic_name || "عيادة"} (#${r.clinic_id})` : "حادثة عامة.",
                          reasonLabel: "ملخص الحل",
                          reasonPlaceholder: "اكتب ملخصًا قصيرًا",
                          minReasonLen: 0,
                          riskLevel: "medium",
                          confirmLabel: "حل",
                        });
                        if (!prompt.ok) return null;
                        const resolution = prompt.reason.trim() ? prompt.reason : undefined;
                        const res = await fetch(`/api/platform/incidents/${r.id}/resolve`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ resolution }),
                          signal,
                        });
                        const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                        if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر الحل.");
                        await load();
                        return true;
                      }, { successToast: "تم الحل" })
                    }
                  >
                    حل
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

