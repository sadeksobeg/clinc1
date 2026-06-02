"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/platform/AsyncState";
import { TableSkeleton, TableToolbar } from "@/components/platform/TableSkeleton";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { ApiResponse } from "@/lib/api-response";
import { useSafetyDialog } from "@/components/platform/SafetyDialogProvider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformPerms } from "@/hooks/usePlatformPerms";
import { hasPerm } from "@/lib/platform-perms";
import { useQuery } from "@tanstack/react-query";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unwrapNestedData(slice: unknown): unknown {
  if (!isRecord(slice)) return slice;
  if ("data" in slice) return slice.data ?? slice;
  return slice;
}

function unwrapTickets(slice: unknown): unknown {
  if (!isRecord(slice)) return slice;
  if ("tickets" in slice && slice.tickets !== undefined) return slice.tickets;
  if ("data" in slice && slice.data !== undefined) return slice.data;
  return slice;
}

function readDbHealth(slice: unknown): { db_ok: boolean; db_latency_ms: number } {
  if (!isRecord(slice)) return { db_ok: true, db_latency_ms: 0 };
  const h = slice.health;
  if (!isRecord(h)) return { db_ok: true, db_latency_ms: 0 };
  return {
    db_ok: h.db_ok !== false,
    db_latency_ms: Number(h.db_latency_ms ?? 0),
  };
}

type Summary = {
  clinic_id: number;
  clinic: { clinic_id: number; clinic_name: string; slug: string | null };
  billing: unknown;
  invoices: unknown;
  tickets: unknown;
  audit: unknown;
  health: unknown;
};

type UserRow = {
  id: number;
  email: string | null;
  display_name: string | null;
  role: string;
  is_active: boolean;
  require_mfa: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type NotificationRow = { id: number; type: string; title: string; body: string; read: boolean; created_at: string | null };

type ServicesSnapshot = { whatsapp_send_disabled: boolean; ai_autoreply_disabled: boolean; auto_booking_disabled: boolean };

const tabValues = ["overview", "billing", "users", "notifications", "services", "support", "audit", "settings"] as const;
type TabValue = (typeof tabValues)[number];

export default function PlatformClinicControlPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const clinicId = Number(params?.id || 0);
  const tab = (search.get("tab") || "overview") as TabValue;

  const action = useAsyncAction();
  const safety = useSafetyDialog();
  const permsQ = usePlatformPerms();

  const summaryQ = useQuery({
    queryKey: ["clinic-summary", clinicId],
    enabled: clinicId > 0,
    queryFn: async () => {
      const res = await fetch(`/api/platform/clinics/${clinicId}/summary`, { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<Summary> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل ملخص العيادة.");
      return out.data;
    },
  });

  const usersQ = useQuery({
    queryKey: ["clinic-users", clinicId],
    enabled: clinicId > 0,
    queryFn: async () => {
      const res = await fetch(`/api/platform/clinics/${clinicId}/users`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; users?: UserRow[]; error?: string } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر تحميل المستخدمين."));
      return Array.isArray(json.users) ? json.users : [];
    },
  });

  const notificationsQ = useQuery({
    queryKey: ["clinic-notifications", clinicId],
    enabled: clinicId > 0,
    queryFn: async () => {
      const res = await fetch(`/api/platform/clinics/${clinicId}/notifications`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; notifications?: NotificationRow[]; error?: string } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر تحميل الإشعارات."));
      return Array.isArray(json.notifications) ? json.notifications : [];
    },
  });

  const servicesQ = useQuery({
    queryKey: ["clinic-services", clinicId],
    enabled: clinicId > 0,
    queryFn: async () => {
      const res = await fetch(`/api/platform/clinics/${clinicId}/services`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; services?: ServicesSnapshot; error?: string } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر تحميل حالة الخدمات."));
      return (json.services ?? { whatsapp_send_disabled: false, ai_autoreply_disabled: false, auto_booking_disabled: false }) as ServicesSnapshot;
    },
    refetchInterval: 15_000,
  });

  const data = summaryQ.data ?? null;
  const status: "loading" | "success" | "error" = summaryQ.isLoading ? "loading" : summaryQ.isError ? "error" : "success";
  const errMsg = summaryQ.error instanceof Error ? summaryQ.error.message : "تعذر الاتصال بالشبكة.";

  const clinicName = data?.clinic?.clinic_name || `عيادة #${clinicId}`;
  const canLifecycleWrite = hasPerm(permsQ.data, "clinic.lifecycle.write");

  const billingSnapshot = useMemo((): unknown | null => {
    const b = data?.billing;
    if (!isRecord(b)) return null;
    const inner = b.data;
    if (isRecord(inner) && "snapshot" in inner) return inner.snapshot ?? null;
    return b.snapshot ?? null;
  }, [data]);

  const dbHealth = useMemo(() => (data ? readDbHealth(data.health) : { db_ok: true, db_latency_ms: 0 }), [data]);

  async function actAsClinic() {
    await action.run(
      async (signal) => {
        const res = await fetch("/api/platform/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acting_clinic_id: clinicId }),
          signal,
        });
        if (!res.ok) throw new Error("تعذر دخول سياق العيادة.");
        router.push("/dashboard");
        router.refresh();
        return true;
      },
      { successToast: "تم تفعيل سياق العيادة" },
    );
  }

  async function lifecycle(actionName: "activate" | "suspend") {
    const prompt =
      actionName === "suspend"
        ? await safety.askReason({
            title: "تعليق العيادة",
            description: "سيتم تعليق الاشتراك لهذه العيادة (قد يوقف بعض الأتمتة).",
            reasonPlaceholder: "سبب التعليق (مطلوب)",
            minReasonLen: 3,
            riskLevel: "high",
            confirmLabel: "تعليق",
          })
        : await safety.askReason({
            title: "تفعيل العيادة",
            description: "هل تريد تفعيل الاشتراك لهذه العيادة؟",
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
        if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تنفيذ الإجراء.");
        return out;
      },
      {
        successToast: actionName === "suspend" ? "تم تعليق العيادة" : "تم تفعيل العيادة",
      },
    );
    if (done) await summaryQ.refetch();
  }

  const [newUser, setNewUser] = useState<{ email: string; display_name: string; role: string; password: string }>({
    email: "",
    display_name: "",
    role: "viewer",
    password: "",
  });
  async function createUser() {
    const prompt = await safety.askReason({
      title: "إنشاء مستخدم",
      description: "سيتم إنشاء/تحديث مستخدم للعيادة بكلمة مرور محددة.",
      reasonPlaceholder: "سبب الإنشاء (اختياري)",
      minReasonLen: 0,
      riskLevel: "medium",
      confirmLabel: "إنشاء",
    });
    if (!prompt.ok) return;
    const done = await action.run(async (signal) => {
      const res = await fetch(`/api/platform/clinics/${clinicId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUser.email,
          display_name: newUser.display_name || undefined,
          role: newUser.role,
          password: newUser.password,
          is_active: true,
        }),
        signal,
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error ?? "تعذر إنشاء المستخدم."));
      return true;
    });
    if (done) {
      setNewUser({ email: "", display_name: "", role: "viewer", password: "" });
      await usersQ.refetch();
    }
  }

  const [notifDraft, setNotifDraft] = useState<{ title: string; body: string }>({ title: "", body: "" });
  async function sendNotification() {
    const title = notifDraft.title.trim();
    const body = notifDraft.body.trim();
    if (title.length < 2 || body.length < 2) {
      await action.run(async () => {
        throw new Error("اكتب عنوانًا ونصًا للإشعار (على الأقل حرفين لكل حقل).");
      });
      return;
    }
    const prompt = await safety.askReason({
      title: "إرسال إشعار للعيادة",
      description: "سيظهر الإشعار داخل لوحة العيادة للمستخدمين.",
      reasonPlaceholder: "سبب الإرسال (اختياري)",
      minReasonLen: 0,
      riskLevel: "medium",
      confirmLabel: "إرسال",
    });
    if (!prompt.ok) return;
    const done = await action.run(async (signal) => {
      const res = await fetch(`/api/platform/clinics/${clinicId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, type: "platform_announcement" }),
        signal,
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error ?? "تعذر إرسال الإشعار."));
      return true;
    });
    if (done) {
      setNotifDraft({ title: "", body: "" });
      await notificationsQ.refetch();
    }
  }

  async function toggleService(flag_key: "whatsapp_send_disabled" | "ai_autoreply_disabled" | "auto_booking_disabled", enabled: boolean) {
    const label =
      flag_key === "whatsapp_send_disabled" ? "واتساب" : flag_key === "ai_autoreply_disabled" ? "الرد الآلي" : "الحجز الآلي";
    const prompt = await safety.askReason({
      title: enabled ? `إيقاف ${label}` : `تشغيل ${label}`,
      description: "هذا إجراء تشغيلي حساس ويؤثر على تجربة العيادة.",
      reasonPlaceholder: "سبب التغيير (مطلوب)",
      minReasonLen: 5,
      riskLevel: "high",
      confirmLabel: enabled ? "إيقاف" : "تشغيل",
    });
    if (!prompt.ok) return;
    const reason = prompt.reason.trim();
    const done = await action.run(async (signal) => {
      const res = await fetch(`/api/platform/clinics/${clinicId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag_key, enabled, reason }),
        signal,
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error ?? "تعذر تنفيذ الإجراء."));
      return true;
    });
    if (done) await servicesQ.refetch();
  }

  const [ownerPatch, setOwnerPatch] = useState<{ owner_name: string; owner_whatsapp: string }>({ owner_name: "", owner_whatsapp: "" });
  const [planPatch, setPlanPatch] = useState<{ plan: "starter_120" | "custom"; base: string; included: string; extra: string }>({
    plan: "starter_120",
    base: "0",
    included: "0",
    extra: "0",
  });
  const [trialDays, setTrialDays] = useState("14");

  async function lifecycleAdvanced(payload: Record<string, unknown>, title: string, confirmLabel: string, risk: "medium" | "high") {
    const prompt = await safety.askReason({
      title,
      description: "سيتم تطبيق التغيير على اشتراك/بيانات العيادة.",
      reasonPlaceholder: "سبب التغيير (مطلوب)",
      minReasonLen: 5,
      riskLevel: risk,
      confirmLabel,
    });
    if (!prompt.ok) return;
    const reason = prompt.reason.trim();
    const done = await action.run(async (signal) => {
      const res = await fetch(`/api/platform/clinics/${clinicId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, reason }),
        signal,
      });
      const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تنفيذ الإجراء.");
      return true;
    });
    if (done) await summaryQ.refetch();
  }

  return (
    <div className="flex flex-col gap-cg-5">
      <PlatformPageHeader
        context="نسق — العيادات"
        title={
          <>
            {clinicName} <span className="text-ds-body text-muted-foreground">#{clinicId}</span>
          </>
        }
        right={
          <>
            <Badge variant="secondary">
              {isRecord(billingSnapshot) && billingSnapshot.status != null ? String(billingSnapshot.status) : "الحالة: غير متوفر"}
            </Badge>
            <Button variant="outline" disabled={action.busy} onClick={() => void actAsClinic()}>
              دخول سياق العيادة
            </Button>
            <Button variant="outline" disabled={action.busy || !canLifecycleWrite} onClick={() => void lifecycle("activate")}>
              تفعيل
            </Button>
            <Button variant="outline" disabled={action.busy || !canLifecycleWrite} onClick={() => void lifecycle("suspend")}>
              تعليق
            </Button>
          </>
        }
      />

      {status === "loading" ? <TableSkeleton rows={8} /> : null}
      {status === "error" ? <ErrorState title="تعذر تحميل العيادة" description={errMsg} onRetry={() => void summaryQ.refetch()} /> : null}

      {status === "success" && data ? (
        <Tabs defaultValue={tabValues.includes(tab) ? tab : "overview"}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="billing">الفوترة</TabsTrigger>
            <TabsTrigger value="users">المستخدمون</TabsTrigger>
            <TabsTrigger value="notifications">الإشعارات</TabsTrigger>
            <TabsTrigger value="services">الخدمات</TabsTrigger>
            <TabsTrigger value="support">الدعم</TabsTrigger>
            <TabsTrigger value="audit">التدقيق</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="rounded-2xl border border-border bg-card p-cg-4">
              <TableToolbar
                title="نظرة عامة"
                subtitle="ملخص إداري سريع"
                right={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/platform/clinics">العودة لقائمة العيادات</Link>
                  </Button>
                }
              />
              <div className="mt-cg-3 grid gap-cg-3 text-ds-body md:grid-cols-2">
                <div className="rounded-xl border border-border/60 p-cg-3">
                  <p className="text-ds-small text-muted-foreground">العيادة</p>
                  <p className="font-semibold">{clinicName}</p>
                  <p className="text-ds-small text-muted-foreground">{data.clinic.slug ? `المعرّف: ${data.clinic.slug}` : "المعرّف: غير متوفر"}</p>
                </div>
                <div className="rounded-xl border border-border/60 p-cg-3">
                  <p className="text-ds-small text-muted-foreground">الصحة</p>
                  <p className="font-semibold">{dbHealth.db_ok === false ? "مشاكل قاعدة البيانات" : "سليم"}</p>
                  <p className="text-ds-small text-muted-foreground">زمن DB: {dbHealth.db_latency_ms}ms</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="billing">
            <div className="rounded-2xl border border-border bg-card p-cg-4">
              <TableToolbar title="الفوترة" subtitle="الاشتراك + طلبات الدفع + الفواتير" />
              <pre className="mt-cg-3 max-h-96 overflow-auto rounded-xl border border-border/60 bg-muted/20 p-cg-3 text-ds-small text-muted-foreground">
                {JSON.stringify(unwrapNestedData(data.billing), null, 2)}
              </pre>
              <pre className="mt-cg-3 max-h-96 overflow-auto rounded-xl border border-border/60 bg-muted/20 p-cg-3 text-ds-small text-muted-foreground">
                {JSON.stringify(unwrapNestedData(data.invoices), null, 2)}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="rounded-2xl border border-border bg-card p-cg-4">
              <TableToolbar title="مستخدمو العيادة" subtitle="إنشاء/تعطيل/حذف/تغيير دور" />
              {usersQ.isLoading ? <TableSkeleton rows={6} /> : null}
              {usersQ.isError ? (
                <ErrorState
                  title="تعذر تحميل المستخدمين"
                  description={usersQ.error instanceof Error ? usersQ.error.message : "خطأ غير معروف"}
                  onRetry={() => void usersQ.refetch()}
                />
              ) : null}
              <div className="mt-cg-3 grid gap-cg-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/60 p-cg-3">
                  <p className="text-ds-body font-semibold">إضافة مستخدم</p>
                  <div className="mt-cg-3 grid gap-cg-2">
                    <Input value={newUser.email} onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))} placeholder="البريد الإلكتروني" />
                    <Input
                      value={newUser.display_name}
                      onChange={(e) => setNewUser((s) => ({ ...s, display_name: e.target.value }))}
                      placeholder="الاسم"
                    />
                    <Select value={newUser.role} onValueChange={(v) => setNewUser((s) => ({ ...s, role: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="الدور" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">مالك</SelectItem>
                        <SelectItem value="admin">مدير</SelectItem>
                        <SelectItem value="operator">مشغل</SelectItem>
                        <SelectItem value="viewer">مشاهِد</SelectItem>
                        <SelectItem value="secretary">سكرتير</SelectItem>
                        <SelectItem value="doctor">طبيب</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={newUser.password}
                      onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
                      placeholder="كلمة المرور المؤقتة"
                      type="password"
                    />
                    <Button
                      onClick={() => void createUser()}
                      disabled={action.busy || permsQ.isLoading || permsQ.isError || !hasPerm(permsQ.data, "clinic.users.write")}
                    >
                      إنشاء
                    </Button>
                    <p className="text-ds-small text-muted-foreground">ملاحظة: يتم حفظ كلمة المرور مباشرة (استخدمها فقط للإعداد الأولي).</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 p-cg-3">
                  <p className="text-ds-body font-semibold">القائمة</p>
                  <div className="mt-cg-3 flex flex-col gap-cg-2 text-ds-body">
                    {(usersQ.data ?? []).length === 0 ? <p className="text-muted-foreground">لا يوجد مستخدمون.</p> : null}
                    {(usersQ.data ?? []).map((u) => (
                      <div key={u.id} className="flex items-center justify-between rounded-xl border border-border/60 px-cg-3 py-cg-2">
                        <div>
                          <p className="font-medium">{u.display_name || u.email || `#${u.id}`}</p>
                          <p className="text-ds-small text-muted-foreground">
                            {u.email || "—"} • الدور: {u.role} • {u.is_active ? "نشط" : "موقوف"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-cg-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={action.busy || !hasPerm(permsQ.data, "clinic.users.write")}
                            onClick={() =>
                              void action
                                .run(async (signal) => {
                                  const res = await fetch(`/api/platform/clinics/${clinicId}/users/${u.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ is_active: !u.is_active }),
                                    signal,
                                  });
                                  const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown } | null;
                                  if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error ?? "تعذر تحديث المستخدم."));
                                  return true;
                                })
                                .then(async (ok) => {
                                  if (ok) await usersQ.refetch();
                                })
                            }
                          >
                            {u.is_active ? "إيقاف" : "تفعيل"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={action.busy || !hasPerm(permsQ.data, "clinic.users.write")}
                            onClick={async () => {
                              const prompt = await safety.askReason({
                                title: "حذف مستخدم",
                                description: "سيتم حذف المستخدم (soft delete).",
                                reasonPlaceholder: "سبب الحذف (مطلوب)",
                                minReasonLen: 5,
                                riskLevel: "high",
                                confirmLabel: "حذف",
                              });
                              if (!prompt.ok) return;
                              const ok = await action.run(async (signal) => {
                                const res = await fetch(`/api/platform/clinics/${clinicId}/users/${u.id}`, { method: "DELETE", signal });
                                const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown } | null;
                                if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error ?? "تعذر حذف المستخدم."));
                                return true;
                              });
                              if (ok) await usersQ.refetch();
                            }}
                          >
                            حذف
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            <div className="rounded-2xl border border-border bg-card p-cg-4">
              <TableToolbar title="إشعارات العيادة" subtitle="إرسال إشعار مخصص + سجل الإرسال" />
              <div className="mt-cg-3 grid gap-cg-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/60 p-cg-3">
                  <p className="text-ds-body font-semibold">إرسال إشعار</p>
                  <div className="mt-cg-3 grid gap-cg-2">
                    <Input value={notifDraft.title} onChange={(e) => setNotifDraft((s) => ({ ...s, title: e.target.value }))} placeholder="العنوان" />
                    <Textarea value={notifDraft.body} onChange={(e) => setNotifDraft((s) => ({ ...s, body: e.target.value }))} placeholder="نص الإشعار" />
                    <p className="text-ds-small text-muted-foreground">ملاحظة: العنوان والنص مطلوبان (حد أدنى حرفين لكل حقل).</p>
                    <Button
                      onClick={() => void sendNotification()}
                      disabled={
                        action.busy ||
                        permsQ.isLoading ||
                        permsQ.isError ||
                        !hasPerm(permsQ.data, "clinic.notifications.write") ||
                        notifDraft.title.trim().length < 2 ||
                        notifDraft.body.trim().length < 2
                      }
                    >
                      إرسال
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 p-cg-3">
                  <p className="text-ds-body font-semibold">السجل</p>
                  {notificationsQ.isLoading ? <TableSkeleton rows={6} /> : null}
                  {notificationsQ.isError ? (
                    <ErrorState
                      title="تعذر تحميل الإشعارات"
                      description={notificationsQ.error instanceof Error ? notificationsQ.error.message : "خطأ غير معروف"}
                      onRetry={() => void notificationsQ.refetch()}
                    />
                  ) : null}
                  <div className="mt-cg-3 flex flex-col gap-cg-2 text-ds-body">
                    {(notificationsQ.data ?? []).length === 0 ? <p className="text-muted-foreground">لا توجد إشعارات.</p> : null}
                    {(notificationsQ.data ?? []).map((n) => (
                      <div key={n.id} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                        <p className="font-medium">{n.title}</p>
                        <p className="text-ds-small text-muted-foreground">{n.created_at ? new Date(n.created_at).toLocaleString("ar") : ""}</p>
                        <p className="mt-cg-1 text-ds-body text-muted-foreground whitespace-pre-wrap">{n.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="services">
            <div className="rounded-2xl border border-border bg-card p-cg-4">
              <TableToolbar title="الخدمات" subtitle="تشغيل/إيقاف خدمات العيادة (واتساب/رد آلي/حجز آلي)" />
              {servicesQ.isLoading ? <TableSkeleton rows={4} /> : null}
              {servicesQ.isError ? (
                <ErrorState
                  title="تعذر تحميل الخدمات"
                  description={servicesQ.error instanceof Error ? servicesQ.error.message : "خطأ غير معروف"}
                  onRetry={() => void servicesQ.refetch()}
                />
              ) : null}
              {servicesQ.data ? (
                <div className="mt-cg-3 grid gap-cg-3 md:grid-cols-3 text-ds-body">
                  <div className="rounded-xl border border-border/60 p-cg-3">
                    <p className="text-ds-small text-muted-foreground">واتساب</p>
                    <p className="font-semibold">{servicesQ.data.whatsapp_send_disabled ? "متوقف" : "يعمل"}</p>
                    <Button
                      className="mt-cg-3"
                      size="sm"
                      variant="outline"
                      disabled={action.busy || !hasPerm(permsQ.data, "clinic.services.write")}
                      onClick={() => void toggleService("whatsapp_send_disabled", !servicesQ.data.whatsapp_send_disabled)}
                    >
                      {servicesQ.data.whatsapp_send_disabled ? "تشغيل" : "إيقاف"}
                    </Button>
                  </div>
                  <div className="rounded-xl border border-border/60 p-cg-3">
                    <p className="text-ds-small text-muted-foreground">الرد الآلي (AI)</p>
                    <p className="font-semibold">{servicesQ.data.ai_autoreply_disabled ? "متوقف" : "يعمل"}</p>
                    <Button
                      className="mt-cg-3"
                      size="sm"
                      variant="outline"
                      disabled={action.busy || !hasPerm(permsQ.data, "clinic.services.write")}
                      onClick={() => void toggleService("ai_autoreply_disabled", !servicesQ.data.ai_autoreply_disabled)}
                    >
                      {servicesQ.data.ai_autoreply_disabled ? "تشغيل" : "إيقاف"}
                    </Button>
                  </div>
                  <div className="rounded-xl border border-border/60 p-cg-3">
                    <p className="text-ds-small text-muted-foreground">الحجز الآلي</p>
                    <p className="font-semibold">{servicesQ.data.auto_booking_disabled ? "متوقف" : "يعمل"}</p>
                    <Button
                      className="mt-cg-3"
                      size="sm"
                      variant="outline"
                      disabled={action.busy || !hasPerm(permsQ.data, "clinic.services.write")}
                      onClick={() => void toggleService("auto_booking_disabled", !servicesQ.data.auto_booking_disabled)}
                    >
                      {servicesQ.data.auto_booking_disabled ? "تشغيل" : "إيقاف"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="support">
            <div className="rounded-2xl border border-border bg-card p-cg-4">
              <TableToolbar title="الدعم" subtitle="آخر التذاكر لهذه العيادة" />
              <pre className="mt-cg-3 max-h-96 overflow-auto rounded-xl border border-border/60 bg-muted/20 p-cg-3 text-ds-small text-muted-foreground">
                {JSON.stringify(unwrapTickets(data.tickets), null, 2)}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <div className="rounded-2xl border border-border bg-card p-cg-4">
              <TableToolbar title="التدقيق" subtitle="آخر السجلات (مفلتر حسب العيادة)" />
              <pre className="mt-cg-3 max-h-96 overflow-auto rounded-xl border border-border/60 bg-muted/20 p-cg-3 text-ds-small text-muted-foreground">
                {JSON.stringify(unwrapNestedData(data.audit), null, 2)}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="rounded-2xl border border-border bg-card p-cg-4">
              <TableToolbar title="الإعدادات" subtitle="سياسات وبيانات العيادة (مرحلة 1)" />
              <div className="mt-cg-3 grid gap-cg-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/60 p-cg-3">
                  <p className="text-ds-body font-semibold">بيانات المالك</p>
                  <p className="text-ds-small text-muted-foreground">حفظ الاسم/واتساب داخل metadata للعيادة.</p>
                  <div className="mt-cg-3 grid gap-cg-2">
                    <Input
                      value={ownerPatch.owner_name}
                      onChange={(e) => setOwnerPatch((s) => ({ ...s, owner_name: e.target.value }))}
                      placeholder="اسم المالك"
                    />
                    <Input
                      value={ownerPatch.owner_whatsapp}
                      onChange={(e) => setOwnerPatch((s) => ({ ...s, owner_whatsapp: e.target.value }))}
                      placeholder="واتساب المالك"
                    />
                    <Button
                      size="sm"
                      disabled={action.busy || !hasPerm(permsQ.data, "clinic.lifecycle.write")}
                      onClick={() =>
                        void lifecycleAdvanced(
                          {
                            action: "set_owner",
                            owner_name: ownerPatch.owner_name || undefined,
                            owner_whatsapp: ownerPatch.owner_whatsapp || undefined,
                          },
                          "تحديث بيانات المالك",
                          "حفظ",
                          "medium",
                        )
                      }
                    >
                      حفظ
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 p-cg-3">
                  <p className="text-ds-body font-semibold">الخطة والتجربة</p>
                  <div className="mt-cg-3 grid gap-cg-2">
                    <div className="grid gap-cg-2 md:grid-cols-2">
                      <Select
                        value={planPatch.plan}
                        onValueChange={(v) => setPlanPatch((s) => ({ ...s, plan: v === "custom" ? "custom" : "starter_120" }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="الخطة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter_120">Starter (120$)</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.busy || !hasPerm(permsQ.data, "clinic.lifecycle.write")}
                        onClick={() =>
                          void lifecycleAdvanced(
                            {
                              action: "set_plan",
                              plan: planPatch.plan,
                              plan_base_price_usd: Number(planPatch.base || 0) || undefined,
                              plan_included_doctors: Number(planPatch.included || 0) || undefined,
                              plan_extra_doctor_price_usd: Number(planPatch.extra || 0) || undefined,
                            },
                            "تحديث الخطة",
                            "تطبيق",
                            "high",
                          )
                        }
                      >
                        تطبيق الخطة
                      </Button>
                    </div>

                    {planPatch.plan === "custom" ? (
                      <div className="grid gap-cg-2 md:grid-cols-3">
                        <Input value={planPatch.base} onChange={(e) => setPlanPatch((s) => ({ ...s, base: e.target.value }))} placeholder="السعر الأساسي (USD)" />
                        <Input
                          value={planPatch.included}
                          onChange={(e) => setPlanPatch((s) => ({ ...s, included: e.target.value }))}
                          placeholder="عدد الأطباء المشمول"
                        />
                        <Input value={planPatch.extra} onChange={(e) => setPlanPatch((s) => ({ ...s, extra: e.target.value }))} placeholder="سعر الطبيب الإضافي (USD)" />
                      </div>
                    ) : null}

                    <div className="mt-cg-2 flex flex-wrap items-center gap-cg-2">
                      <Input value={trialDays} onChange={(e) => setTrialDays(e.target.value)} placeholder="أيام التجربة" className="w-40" />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.busy || !hasPerm(permsQ.data, "clinic.lifecycle.write")}
                        onClick={() =>
                          void lifecycleAdvanced({ action: "set_trial_days", trial_days: Number(trialDays || 0) }, "تحديد أيام التجربة", "تطبيق", "medium")
                        }
                      >
                        تحديد التجربة
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

