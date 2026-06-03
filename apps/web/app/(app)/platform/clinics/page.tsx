"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/platform/AsyncState";
import { TableSkeleton, TableToolbar } from "@/components/platform/TableSkeleton";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useSafetyDialog } from "@/components/platform/SafetyDialogProvider";
import { usePlatformPerms } from "@/hooks/usePlatformPerms";
import type { ApiResponse } from "@/lib/api-response";
import { hasPerm } from "@/lib/platform-perms";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ClinicRow = {
  clinic_id: number;
  clinic_name: string;
  status: string;
  estimated_monthly_total_usd: number;
  next_renewal_at?: string | null;
};

type PresenceRow = { clinic_id: number; online: boolean; last_seen_at: string | null };
type ClinicStatsRow = { clinic_id: number; users_count: number; open_tickets_count: number; last_ticket_at: string | null };

export default function PlatformClinicsPage() {
  const router = useRouter();
  const action = useAsyncAction();
  const safety = useSafetyDialog();
  const permsQ = usePlatformPerms();
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newClinicName, setNewClinicName] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [newDoctorsCount, setNewDoctorsCount] = useState("1");
  const [newTrialDays, setNewTrialDays] = useState("7");
  const [newSpecialtyIds, setNewSpecialtyIds] = useState<number[]>([]);
  const [newDoctorName, setNewDoctorName] = useState("");

  const specialtiesQ = useQuery({
    queryKey: ["platform-specialties-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/platform/specialties", { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as { ok?: boolean; specialties?: Array<{ id: number; code: string; label_ar: string }> } | null;
      if (!res.ok || !out?.ok) return [];
      return out.specialties ?? [];
    },
  });

  const clinicsQ = useQuery({
    queryKey: ["clinics-overview"],
    queryFn: async () => {
      const res = await fetch("/api/platform/clinics/overview", { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<{ clinics: ClinicRow[] }> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل قائمة العيادات.");
      return Array.isArray(out.data.clinics) ? out.data.clinics : [];
    },
  });

  const presenceQ = useQuery({
    queryKey: ["clinics-presence"],
    queryFn: async () => {
      const res = await fetch("/api/platform/clinics/presence?window_minutes=5", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; clinics?: PresenceRow[] } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error("تعذر تحميل حالة الاتصال للعيادات.");
      return Array.isArray(json.clinics) ? json.clinics : [];
    },
    refetchInterval: 15_000,
  });

  const statsQ = useQuery({
    queryKey: ["clinics-stats"],
    queryFn: async () => {
      const res = await fetch("/api/platform/clinics/stats", { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<{ clinics: ClinicStatsRow[] }> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل إحصائيات العيادات.");
      return Array.isArray(out.data.clinics) ? out.data.clinics : [];
    },
    refetchInterval: 30_000,
  });

  const status = clinicsQ.isLoading ? "loading" : clinicsQ.isError ? "error" : "success";
  const errMsg = clinicsQ.error instanceof Error ? clinicsQ.error.message : "تعذر الاتصال بالشبكة.";
  const clinics = clinicsQ.data ?? [];
  const presenceByClinic = new Map<number, PresenceRow>((presenceQ.data ?? []).map((p) => [Number(p.clinic_id), p]));
  const statsByClinic = new Map<number, ClinicStatsRow>((statsQ.data ?? []).map((s) => [Number(s.clinic_id), s]));

  async function lifecycle(clinicId: number, actionName: "suspend" | "activate") {
    const prompt =
      actionName === "suspend"
        ? await safety.askReason({
            title: "تعليق العيادة",
            description: `تعليق العيادة #${clinicId}؟`,
            reasonPlaceholder: "سبب التعليق (مطلوب)",
            minReasonLen: 3,
            riskLevel: "high",
            confirmLabel: "تعليق",
          })
        : await safety.askReason({
            title: "تفعيل العيادة",
            description: `تفعيل العيادة #${clinicId}؟`,
            reasonPlaceholder: "سبب التفعيل (اختياري)",
            minReasonLen: 0,
            riskLevel: "medium",
            confirmLabel: "تفعيل",
          });
    if (!prompt.ok) return;
    const reason = prompt.reason.trim() || undefined;

    const done = await action.run(
      async (signal) => {
        const res = await fetch(`/api/platform/clinics/${clinicId}/lifecycle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionName, reason }),
          signal,
        });
        const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
        if (!res.ok || !out || out.ok !== true) {
          throw new Error(out && out.ok === false ? out.error.message : "تعذر تنفيذ الإجراء.");
        }
        return out;
      },
      {
        successToast: actionName === "suspend" ? "تم تعليق العيادة" : "تم تفعيل العيادة",
      },
    );
    if (done) await clinicsQ.refetch();
  }

  async function enterClinic(clinicId: number) {
    const done = await action.run(
      async (signal) => {
        const res = await fetch("/api/platform/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acting_clinic_id: clinicId }),
          signal,
        });
        if (!res.ok) throw new Error("تعذر تفعيل سياق العيادة.");
        return true;
      },
      { successToast: "تم الدخول إلى سياق العيادة" },
    );
    if (done) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-cg-5">
      <PlatformPageHeader title="العيادات" />
      {status === "loading" ? <TableSkeleton rows={8} /> : null}
      {status === "error" ? <ErrorState title="تعذر تحميل العيادات" description={errMsg} onRetry={() => void clinicsQ.refetch()} /> : null}
      {status === "success" ? (
        <div className="rounded-2xl border border-border bg-card p-cg-4">
          <TableToolbar
            title="العيادات"
            subtitle="دليل العيادات"
            right={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث بالاسم/الحالة/الرقم" className="w-72" />}
          />
          <div className="mt-cg-3 flex flex-wrap gap-cg-2">
            <Button size="sm" variant="outline" onClick={() => void clinicsQ.refetch()}>
              تحديث
            </Button>
            <Button size="sm" variant="outline" onClick={() => void presenceQ.refetch()} disabled={presenceQ.isLoading}>
              تحديث الاتصال
            </Button>
            <Button size="sm" variant="outline" onClick={() => void statsQ.refetch()} disabled={statsQ.isLoading}>
              تحديث الإحصائيات
            </Button>
            {permsQ.data?.perms?.includes("*") || permsQ.data?.perms?.includes("clinic.create") ? (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">إنشاء عيادة جديدة</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>إنشاء عيادة للتجربة</DialogTitle>
                    <DialogDescription>سينشئ عيادة + حساب أدمن + تجربة + أطباء بشكل تلقائي.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-cg-3">
                    <Input value={newClinicName} onChange={(e) => setNewClinicName(e.target.value)} placeholder="اسم العيادة" />
                    <Input value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder="اسم المالك/الأدمن" />
                    <Input value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} placeholder="email الأدمن" type="email" />
                    <Input value={newOwnerPassword} onChange={(e) => setNewOwnerPassword(e.target.value)} placeholder="كلمة المرور" type="password" />
                    <div className="grid gap-cg-2 md:grid-cols-2">
                      <Input value={newDoctorsCount} onChange={(e) => setNewDoctorsCount(e.target.value)} placeholder="عدد الأطباء" />
                      <Input value={newTrialDays} onChange={(e) => setNewTrialDays(e.target.value)} placeholder="أيام التجربة" />
                    </div>
                    <Input
                      value={newDoctorName}
                      onChange={(e) => setNewDoctorName(e.target.value)}
                      placeholder="اسم الطبيب (مثال: د. أحمد)"
                    />
                    <div className="rounded-xl border border-border/70 p-cg-3">
                      <p className="mb-cg-2 text-ds-small font-medium">تخصصات العيادة (يختارها المريض في واتساب)</p>
                      <div className="flex max-h-40 flex-col gap-cg-1 overflow-y-auto">
                        {(specialtiesQ.data ?? []).map((s) => {
                          const checked = newSpecialtyIds.includes(s.id);
                          return (
                            <label key={s.id} className="flex cursor-pointer items-center gap-2 text-ds-small">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setNewSpecialtyIds((prev) =>
                                    checked ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                                  )
                                }
                              />
                              <span>{s.label_ar}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex justify-end gap-cg-2">
                      <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={action.busy}>
                        إلغاء
                      </Button>
                      <Button
                        disabled={
                          action.busy ||
                          newClinicName.trim().length < 2 ||
                          newOwnerName.trim().length < 2 ||
                          !newOwnerEmail.includes("@") ||
                          newOwnerPassword.length < 8 ||
                          newSpecialtyIds.length < 1
                        }
                        onClick={() =>
                          void action.run(
                            async (signal) => {
                              const res = await fetch("/api/platform/clinics/create", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  clinic_name: newClinicName.trim(),
                                  owner_name: newOwnerName.trim(),
                                  owner_email: newOwnerEmail.trim(),
                                  owner_password: newOwnerPassword,
                                  doctors_count: Math.max(1, Math.min(50, Number(newDoctorsCount || 1) || 1)),
                                  trial_days: Math.max(1, Math.min(30, Number(newTrialDays || 7) || 7)),
                                  specialty_ids: newSpecialtyIds,
                                  doctor_names: newDoctorName.trim() ? [newDoctorName.trim()] : undefined,
                                }),
                                signal,
                              });
                              const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                              if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر إنشاء العيادة.");
                              setCreateOpen(false);
                              setNewClinicName("");
                              setNewOwnerName("");
                              setNewOwnerEmail("");
                              setNewOwnerPassword("");
                              await Promise.all([clinicsQ.refetch(), statsQ.refetch(), presenceQ.refetch()]).catch(() => undefined);
                              return out.data;
                            },
                            { successToast: "تم إنشاء عيادة جديدة" },
                          )
                        }
                      >
                        إنشاء
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
          <div className="mt-cg-3 flex flex-col gap-cg-2 text-ds-body">
            {clinics.length === 0 ? <p className="text-muted-foreground">لا توجد عيادات بعد.</p> : null}
            {clinics
              .filter((c) => {
                const q = filter.trim().toLowerCase();
                if (!q) return true;
                return (
                  String(c.clinic_name || "").toLowerCase().includes(q) ||
                  String(c.status || "").toLowerCase().includes(q) ||
                  String(c.clinic_id).includes(q)
                );
              })
              .slice(0, 50)
              .map((c) => (
              <div key={c.clinic_id} className="flex flex-wrap items-center justify-between gap-cg-3 rounded-xl border border-border/60 px-cg-3 py-cg-2">
                <div>
                  <p className="font-medium">
                    #{c.clinic_id} — {c.clinic_name}
                  </p>
                  <p className="text-ds-small text-muted-foreground">
                    الحالة: {c.status}{" "}
                    {c.next_renewal_at ? `• التجديد: ${new Date(c.next_renewal_at).toLocaleDateString("ar")}` : ""}
                  </p>
                  <div className="mt-cg-1 flex flex-wrap items-center gap-cg-2">
                    {(() => {
                      const p = presenceByClinic.get(c.clinic_id);
                      if (!p) return <span className="text-ds-small text-muted-foreground">الاتصال: غير متوفر</span>;
                      if (p.online) return <Badge>متصل الآن</Badge>;
                      if (p.last_seen_at)
                        return (
                          <span className="text-ds-small text-muted-foreground">
                            آخر ظهور: {new Date(p.last_seen_at).toLocaleString("ar")}
                          </span>
                        );
                      return <span className="text-ds-small text-muted-foreground">آخر ظهور: غير معروف</span>;
                    })()}
                    {(() => {
                      const s = statsByClinic.get(c.clinic_id);
                      if (!s) return null;
                      return (
                        <>
                          <Badge variant="outline">مستخدمون: {Number(s.users_count || 0)}</Badge>
                          <Badge variant={Number(s.open_tickets_count || 0) > 0 ? "warning" : "outline"}>
                            تذاكر مفتوحة: {Number(s.open_tickets_count || 0)}
                          </Badge>
                          {s.last_ticket_at ? (
                            <span className="text-ds-small text-muted-foreground">آخر تذكرة: {new Date(s.last_ticket_at).toLocaleDateString("ar")}</span>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-cg-2">
                  <p className="text-ds-body font-semibold">{Number(c.estimated_monthly_total_usd || 0).toFixed(0)}$</p>
                  <Button size="sm" onClick={() => void enterClinic(c.clinic_id)} disabled={action.busy}>
                    دخول العيادة
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => router.push(`/platform/clinics/${c.clinic_id}?tab=overview`)}>
                    مركز العيادة
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => router.push(`/platform/clinics/${c.clinic_id}?tab=support`)}>
                    الدعم
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "clinic.lifecycle.write")}
                    onClick={() => void lifecycle(c.clinic_id, "activate")}
                  >
                    تفعيل
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "clinic.lifecycle.write")}
                    onClick={() => void lifecycle(c.clinic_id, "suspend")}
                  >
                    تعليق
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

