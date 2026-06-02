"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, LoadingState } from "@/components/platform/AsyncState";

type Specialty = {
  id: number;
  code: string;
  label_ar: string;
  label_en: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

type WhatsAppRoute = {
  id: number;
  to_number: string;
  hub_clinic_id: number;
  allowed_clinic_ids: number[];
  welcome_message_ar: string | null;
  is_active: boolean;
  notes: string | null;
};

type ClinicSpec = { clinic_id: number; specialty_id: number; is_active: boolean };
type DoctorRow = {
  doctor_id: number;
  display_name: string;
  clinic_id: number;
  legacy_specialty: string | null;
  specialties: { specialty_id: number; code: string; label_ar: string; is_primary: boolean }[];
};

type ClinicLite = { id: number; name: string };

type AntiBanStats = {
  bridge_status: {
    ready?: boolean;
    daily_caps?: { day: string; global: number; maxGlobal: number; usage_global_pct: number } | null;
    warmup?: { active: boolean; day_index: number | null; multiplier: number; remaining_days: number } | null;
    broadcast?: { paused: boolean; paused_until: number; last_trip_at: number; last_trip_chats: number } | null;
    audit_enabled?: boolean;
  } | null;
  audit_summary: { status: string; n: number }[];
  top_blocked_reasons: { blocked_reason: string; n: number }[];
  recent: {
    id: number;
    chat_id: string;
    clinic_id: number | null;
    status: string;
    blocked_reason: string | null;
    send_kind: string;
    latency_ms: number | null;
    created_at: string;
  }[];
  numbers: {
    to_number: string;
    paired_at: string | null;
    last_connected_at: string | null;
    last_disconnected_at: string | null;
    is_paused: boolean;
    paused_reason: string | null;
  }[];
};

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  const out = (await r.json().catch(() => null)) as any;
  if (!r.ok || !out || out.ok === false) {
    throw new Error(out?.error || `Request failed: ${r.status}`);
  }
  return out as T;
}

async function apiSend(path: string, method: string, body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = (await r.json().catch(() => null)) as any;
  if (!r.ok || !out || out.ok === false) {
    throw new Error(out?.error || `Request failed: ${r.status}`);
  }
  return out;
}

export default function WhatsAppRoutingAdminPage() {
  const [tab, setTab] = useState("specialties");

  return (
    <div className="flex flex-col gap-cg-5" dir="rtl">
      <PlatformPageHeader
        title="توجيه واتساب متعدد العيادات"
        description="إدارة التخصصات، أرقام واتساب، حالة الحماية ضد الحظر، والتحكم الفوري."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="specialties">التخصصات</TabsTrigger>
          <TabsTrigger value="clinic-spec">العيادات × التخصصات</TabsTrigger>
          <TabsTrigger value="doctor-spec">الأطباء × التخصصات</TabsTrigger>
          <TabsTrigger value="wa-numbers">أرقام واتساب</TabsTrigger>
          <TabsTrigger value="health">صحة الرقم</TabsTrigger>
          <TabsTrigger value="runtime">التحكم الفوري</TabsTrigger>
        </TabsList>

        <TabsContent value="specialties">
          <SpecialtiesPanel />
        </TabsContent>
        <TabsContent value="clinic-spec">
          <ClinicSpecialtiesPanel />
        </TabsContent>
        <TabsContent value="doctor-spec">
          <DoctorSpecialtiesPanel />
        </TabsContent>
        <TabsContent value="wa-numbers">
          <WaNumbersPanel />
        </TabsContent>
        <TabsContent value="health">
          <HealthPanel />
        </TabsContent>
        <TabsContent value="runtime">
          <RuntimeControlsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Specialties
// ─────────────────────────────────────────────────────────────────────────
function SpecialtiesPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["specialties"],
    queryFn: () => apiGet<{ ok: true; specialties: Specialty[] }>("/api/platform/specialties"),
  });

  const [form, setForm] = useState<{ code: string; label_ar: string; sort_order: number }>({
    code: "",
    label_ar: "",
    sort_order: 100,
  });

  const create = useMutation({
    mutationFn: () => apiSend("/api/platform/specialties", "POST", { ...form, is_active: true }),
    onSuccess: () => {
      setForm({ code: "", label_ar: "", sort_order: 100 });
      void qc.invalidateQueries({ queryKey: ["specialties"] });
    },
  });

  const toggle = useMutation({
    mutationFn: (sp: Specialty) =>
      apiSend("/api/platform/specialties", "POST", {
        code: sp.code,
        label_ar: sp.label_ar,
        label_en: sp.label_en,
        icon: sp.icon,
        sort_order: sp.sort_order,
        is_active: !sp.is_active,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["specialties"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-ds-h3">كتالوج التخصصات</CardTitle>
        <CardDescription>التخصصات العامة. كل عيادة تختار من هذه القائمة ما تقدمه.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-cg-4">
        <div className="grid grid-cols-1 gap-cg-2 md:grid-cols-4">
          <Input
            placeholder="الرمز (مثل: dentist)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
          />
          <Input
            placeholder="الاسم بالعربية"
            value={form.label_ar}
            onChange={(e) => setForm({ ...form, label_ar: e.target.value })}
          />
          <Input
            type="number"
            placeholder="الترتيب"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
          />
          <Button
            disabled={!form.code || !form.label_ar || create.isPending}
            onClick={() => create.mutate()}
          >
            إضافة / تحديث
          </Button>
        </div>
        {create.isError ? (
          <p className="text-ds-small text-destructive">{(create.error as Error).message}</p>
        ) : null}

        {q.isLoading ? <LoadingState title="جارٍ التحميل..." /> : null}
        {q.isError ? <ErrorState title="فشل التحميل" description={(q.error as Error).message} /> : null}

        {q.data ? (
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-ds-body">
              <thead className="bg-muted text-ds-small">
                <tr>
                  <th className="px-cg-3 py-cg-2 text-start">الرمز</th>
                  <th className="px-cg-3 py-cg-2 text-start">الاسم</th>
                  <th className="px-cg-3 py-cg-2 text-start">الترتيب</th>
                  <th className="px-cg-3 py-cg-2 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {q.data.specialties.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-cg-3 py-cg-2">{s.code}</td>
                    <td className="px-cg-3 py-cg-2">{s.label_ar}</td>
                    <td className="px-cg-3 py-cg-2">{s.sort_order}</td>
                    <td className="px-cg-3 py-cg-2">
                      <Switch checked={s.is_active} onCheckedChange={() => toggle.mutate(s)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Clinic × Specialty matrix
// ─────────────────────────────────────────────────────────────────────────
function useClinics() {
  return useQuery({
    queryKey: ["platform-clinics-overview"],
    queryFn: async () => {
      const r = await fetch("/api/platform/clinics/overview", { cache: "no-store" });
      const out = (await r.json().catch(() => null)) as any;
      const rawList = (out?.data?.clinics || out?.clinics || []) as Array<{
        clinic_id?: number;
        clinic_name?: string;
        id?: number;
        name?: string;
      }>;
      return rawList
        .map((c) => ({ id: Number(c.clinic_id ?? c.id ?? 0), name: String(c.clinic_name ?? c.name ?? "") }))
        .filter((c) => c.id > 0) as ClinicLite[];
    },
  });
}

function ClinicSpecialtiesPanel() {
  const qc = useQueryClient();
  const specs = useQuery({
    queryKey: ["specialties"],
    queryFn: () => apiGet<{ ok: true; specialties: Specialty[] }>("/api/platform/specialties"),
  });
  const matrix = useQuery({
    queryKey: ["clinic-specialties"],
    queryFn: () => apiGet<{ ok: true; rows: ClinicSpec[] }>("/api/platform/clinic-specialties"),
  });
  const clinics = useClinics();

  const toggle = useMutation({
    mutationFn: (v: { clinic_id: number; specialty_id: number; is_active: boolean }) =>
      apiSend("/api/platform/clinic-specialties", "POST", v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["clinic-specialties"] }),
  });

  if (specs.isLoading || matrix.isLoading || clinics.isLoading) return <LoadingState title="جارٍ التحميل..." />;
  if (specs.isError || matrix.isError) {
    return <ErrorState title="فشل التحميل" description="تعذر تحميل المصفوفة." />;
  }
  const map = new Map<string, boolean>();
  for (const r of matrix.data?.rows || []) map.set(`${r.clinic_id}:${r.specialty_id}`, r.is_active);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-ds-h3">العيادات × التخصصات</CardTitle>
        <CardDescription>أيّ تخصص متوفر في أيّ عيادة. التغيير فوري.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="min-w-full text-ds-body">
            <thead className="bg-muted text-ds-small">
              <tr>
                <th className="px-cg-3 py-cg-2 text-start">العيادة</th>
                {(specs.data?.specialties || []).filter((s) => s.is_active).map((s) => (
                  <th key={s.id} className="px-cg-3 py-cg-2 text-start">
                    {s.label_ar}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(clinics.data || []).map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-cg-3 py-cg-2 font-medium">{c.name}</td>
                  {(specs.data?.specialties || []).filter((s) => s.is_active).map((s) => {
                    const on = map.get(`${c.id}:${s.id}`) || false;
                    return (
                      <td key={s.id} className="px-cg-3 py-cg-2">
                        <Switch
                          checked={on}
                          onCheckedChange={(v) =>
                            toggle.mutate({ clinic_id: c.id, specialty_id: s.id, is_active: Boolean(v) })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Doctor × Specialty
// ─────────────────────────────────────────────────────────────────────────
function DoctorSpecialtiesPanel() {
  const qc = useQueryClient();
  const specs = useQuery({
    queryKey: ["specialties"],
    queryFn: () => apiGet<{ ok: true; specialties: Specialty[] }>("/api/platform/specialties"),
  });
  const docs = useQuery({
    queryKey: ["doctor-specialties"],
    queryFn: () => apiGet<{ ok: true; doctors: DoctorRow[] }>("/api/platform/doctor-specialties"),
  });

  const save = useMutation({
    mutationFn: (v: { doctor_id: number; specialty_ids: number[]; primary_specialty_id: number | null }) =>
      apiSend("/api/platform/doctor-specialties", "POST", v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["doctor-specialties"] }),
  });

  if (specs.isLoading || docs.isLoading) return <LoadingState title="جارٍ التحميل..." />;
  if (specs.isError || docs.isError) return <ErrorState title="فشل التحميل" description="تعذر تحميل الأطباء." />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-ds-h3">الأطباء × التخصصات</CardTitle>
        <CardDescription>كل طبيب يمكن أن يكون له تخصص رئيسي وتخصصات فرعية.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-cg-3">
        {(docs.data?.doctors || []).map((d) => {
          const selected = new Set(d.specialties.map((s) => s.specialty_id));
          const primary = d.specialties.find((s) => s.is_primary)?.specialty_id || null;
          return (
            <div key={d.doctor_id} className="rounded-xl border p-cg-3">
              <div className="mb-cg-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">د. {d.display_name}</div>
                  <div className="text-ds-small text-muted-foreground">
                    عيادة #{d.clinic_id}{d.legacy_specialty ? ` · قديم: ${d.legacy_specialty}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-cg-2">
                {(specs.data?.specialties || []).filter((s) => s.is_active).map((s) => {
                  const on = selected.has(s.id);
                  const isPrimary = primary === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(selected);
                        if (on) next.delete(s.id);
                        else next.add(s.id);
                        save.mutate({
                          doctor_id: d.doctor_id,
                          specialty_ids: Array.from(next),
                          primary_specialty_id: on && isPrimary ? null : isPrimary ? s.id : primary,
                        });
                      }}
                      className={`rounded-full border px-cg-3 py-cg-1 text-ds-small ${
                        on ? "bg-primary text-primary-foreground" : "bg-background"
                      }`}
                    >
                      {s.label_ar}
                      {isPrimary ? " ★" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// WhatsApp inbound routes
// ─────────────────────────────────────────────────────────────────────────
function WaNumbersPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-routes"],
    queryFn: () => apiGet<{ ok: true; routes: WhatsAppRoute[] }>("/api/platform/whatsapp-routes"),
  });
  const clinics = useClinics();
  const [form, setForm] = useState({
    to_number: "",
    hub_clinic_id: 0,
    allowed_clinic_ids: "",
    welcome_message_ar: "",
    notes: "",
  });
  const save = useMutation({
    mutationFn: () => {
      const allowed = form.allowed_clinic_ids
        .split(/[,\s]+/)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
      return apiSend("/api/platform/whatsapp-routes", "POST", {
        to_number: form.to_number,
        hub_clinic_id: form.hub_clinic_id,
        allowed_clinic_ids: allowed,
        welcome_message_ar: form.welcome_message_ar || null,
        notes: form.notes || null,
        is_active: true,
      });
    },
    onSuccess: () => {
      setForm({ to_number: "", hub_clinic_id: 0, allowed_clinic_ids: "", welcome_message_ar: "", notes: "" });
      void qc.invalidateQueries({ queryKey: ["wa-routes"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiSend(`/api/platform/whatsapp-routes?id=${id}`, "DELETE"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wa-routes"] }),
  });

  const clinicLookup = new Map<number, string>();
  for (const c of clinics.data || []) clinicLookup.set(c.id, c.name);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-ds-h3">أرقام واتساب الواردة</CardTitle>
        <CardDescription>كل رقم يربط بـ Hub clinic + قائمة العيادات المسموحة بالتوجيه إليها.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-cg-4">
        <div className="grid grid-cols-1 gap-cg-2 md:grid-cols-3">
          <Input
            placeholder="الرقم (+9627XXXXXXXX)"
            value={form.to_number}
            onChange={(e) => setForm({ ...form, to_number: e.target.value })}
          />
          <Input
            type="number"
            placeholder="ID عيادة Hub"
            value={form.hub_clinic_id || ""}
            onChange={(e) => setForm({ ...form, hub_clinic_id: Number(e.target.value) || 0 })}
          />
          <Input
            placeholder="IDs العيادات المسموحة (مفصولة بفاصلة)"
            value={form.allowed_clinic_ids}
            onChange={(e) => setForm({ ...form, allowed_clinic_ids: e.target.value })}
          />
        </div>
        <Textarea
          placeholder="رسالة الترحيب (اختيارية)"
          value={form.welcome_message_ar}
          onChange={(e) => setForm({ ...form, welcome_message_ar: e.target.value })}
        />
        <Input
          placeholder="ملاحظات إدارية"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <Button
          disabled={!form.to_number || !form.hub_clinic_id || save.isPending}
          onClick={() => save.mutate()}
        >
          إضافة / تحديث
        </Button>
        {save.isError ? (
          <p className="text-ds-small text-destructive">{(save.error as Error).message}</p>
        ) : null}

        {q.isLoading ? <LoadingState title="جارٍ التحميل..." /> : null}
        {q.isError ? <ErrorState title="فشل التحميل" description={(q.error as Error).message} /> : null}

        {q.data ? (
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-ds-body">
              <thead className="bg-muted text-ds-small">
                <tr>
                  <th className="px-cg-3 py-cg-2 text-start">الرقم</th>
                  <th className="px-cg-3 py-cg-2 text-start">Hub</th>
                  <th className="px-cg-3 py-cg-2 text-start">العيادات المسموحة</th>
                  <th className="px-cg-3 py-cg-2 text-start">نشط</th>
                  <th className="px-cg-3 py-cg-2 text-start">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {q.data.routes.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-cg-3 py-cg-2 font-mono">{r.to_number}</td>
                    <td className="px-cg-3 py-cg-2">
                      {clinicLookup.get(r.hub_clinic_id) || `#${r.hub_clinic_id}`}
                    </td>
                    <td className="px-cg-3 py-cg-2 text-ds-small">
                      {(r.allowed_clinic_ids || [])
                        .map((id) => clinicLookup.get(id) || `#${id}`)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-cg-3 py-cg-2">
                      <Badge variant={r.is_active ? "success" : "secondary"}>
                        {r.is_active ? "نشط" : "متوقف"}
                      </Badge>
                    </td>
                    <td className="px-cg-3 py-cg-2">
                      <Button size="sm" variant="outline" onClick={() => remove.mutate(r.id)}>
                        تعطيل
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Anti-ban health
// ─────────────────────────────────────────────────────────────────────────
function HealthPanel() {
  const q = useQuery({
    queryKey: ["anti-ban-stats"],
    queryFn: () => apiGet<{ ok: true } & AntiBanStats>("/api/platform/whatsapp/anti-ban-stats"),
    refetchInterval: 15_000,
  });

  if (q.isLoading) return <LoadingState title="جارٍ التحميل..." />;
  if (q.isError) return <ErrorState title="فشل التحميل" description={(q.error as Error).message} />;
  const d = q.data;
  const bs = d?.bridge_status || null;
  const usagePct = bs?.daily_caps?.usage_global_pct
    ? Math.round((bs.daily_caps.usage_global_pct as number) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-cg-4">
      <div className="grid gap-cg-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-ds-h3">السقف اليومي العام</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-ds-h2 font-semibold">{usagePct}%</div>
            <div className="text-ds-small text-muted-foreground">
              {bs?.daily_caps
                ? `${bs.daily_caps.global} / ${bs.daily_caps.maxGlobal} (يوم ${bs.daily_caps.day})`
                : "غير متاح"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-ds-h3">Warm-up</CardTitle>
          </CardHeader>
          <CardContent>
            {bs?.warmup?.active ? (
              <>
                <div className="text-ds-h2 font-semibold">يوم {bs.warmup.day_index ?? "?"} من 7</div>
                <div className="text-ds-small text-muted-foreground">
                  معامل {Math.round((bs.warmup.multiplier || 0) * 100)}% — متبقي {bs.warmup.remaining_days} يوم
                </div>
              </>
            ) : (
              <div className="text-ds-small text-muted-foreground">منتهٍ — السقوف الكاملة فعّالة</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-ds-h3">قاطع البث</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={bs?.broadcast?.paused ? "danger" : "success"}>
              {bs?.broadcast?.paused ? "متوقف" : "نشط"}
            </Badge>
            <div className="mt-cg-1 text-ds-small text-muted-foreground">
              {bs?.broadcast?.last_trip_at
                ? `آخر تفعيل: ${new Date(bs.broadcast.last_trip_at).toLocaleString("ar")} (${bs.broadcast.last_trip_chats} محادثة)`
                : "لم يتفعل بعد"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-ds-h3">ملخص الإرسالات (24 ساعة)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-cg-2">
            {(d?.audit_summary || []).map((row) => (
              <Badge key={row.status} variant="outline">
                {row.status}: {row.n}
              </Badge>
            ))}
            {d?.audit_summary?.length === 0 ? (
              <span className="text-ds-small text-muted-foreground">لا توجد بيانات بعد.</span>
            ) : null}
          </div>
          {d?.top_blocked_reasons?.length ? (
            <div className="mt-cg-3">
              <div className="mb-cg-2 text-ds-body font-medium">أكثر أسباب الحجب:</div>
              <ul className="flex flex-wrap gap-cg-2">
                {d.top_blocked_reasons.map((r) => (
                  <li key={r.blocked_reason}>
                    <Badge variant="danger">
                      {r.blocked_reason}: {r.n}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-ds-h3">آخر 50 رسالة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-ds-small">
              <thead className="bg-muted">
                <tr>
                  <th className="px-cg-3 py-cg-2 text-start">الوقت</th>
                  <th className="px-cg-3 py-cg-2 text-start">المحادثة</th>
                  <th className="px-cg-3 py-cg-2 text-start">العيادة</th>
                  <th className="px-cg-3 py-cg-2 text-start">النوع</th>
                  <th className="px-cg-3 py-cg-2 text-start">الحالة</th>
                  <th className="px-cg-3 py-cg-2 text-start">سبب الحجب</th>
                  <th className="px-cg-3 py-cg-2 text-start">زمن (ms)</th>
                </tr>
              </thead>
              <tbody>
                {(d?.recent || []).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-cg-3 py-cg-2 font-mono text-ds-small">
                      {new Date(row.created_at).toLocaleTimeString("ar")}
                    </td>
                    <td className="px-cg-3 py-cg-2 font-mono text-ds-small">{row.chat_id}</td>
                    <td className="px-cg-3 py-cg-2">{row.clinic_id ?? "—"}</td>
                    <td className="px-cg-3 py-cg-2">{row.send_kind}</td>
                    <td className="px-cg-3 py-cg-2">
                      <Badge
                        variant={
                          row.status === "sent"
                            ? "success"
                            : row.status === "blocked" || row.status === "failed"
                              ? "danger"
                              : "secondary"
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-cg-3 py-cg-2">{row.blocked_reason || "—"}</td>
                    <td className="px-cg-3 py-cg-2 font-mono">{row.latency_ms ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Runtime controls
// ─────────────────────────────────────────────────────────────────────────
function RuntimeControlsPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-runtime"],
    queryFn: () =>
      apiGet<{
        ok: true;
        whatsapp_send_disabled: boolean;
        numbers: { to_number: string; is_paused: boolean; paused_reason: string | null }[];
      }>("/api/platform/whatsapp/runtime-controls"),
  });
  const [reason, setReason] = useState("");
  const [toNumber, setToNumber] = useState("");

  const act = useMutation({
    mutationFn: (action: string) =>
      apiSend("/api/platform/whatsapp/runtime-controls", "POST", {
        action,
        to_number: toNumber || undefined,
        reason: reason || `Manual: ${action}`,
      }),
    onSuccess: () => {
      setReason("");
      void qc.invalidateQueries({ queryKey: ["wa-runtime"] });
    },
  });

  if (q.isLoading) return <LoadingState title="جارٍ التحميل..." />;
  if (q.isError) return <ErrorState title="فشل التحميل" description={(q.error as Error).message} />;

  return (
    <div className="flex flex-col gap-cg-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-ds-h3">إيقاف / استئناف الإرسال الكلي</CardTitle>
          <CardDescription>يقطع كل الرسائل الصادرة فورًا (للطوارئ — حظر متوقع، اختبار).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-3">
          <Badge variant={q.data?.whatsapp_send_disabled ? "danger" : "success"}>
            {q.data?.whatsapp_send_disabled ? "متوقف الآن" : "نشط الآن"}
          </Badge>
          <Textarea
            placeholder="السبب (يظهر في سجل التدقيق)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-cg-2">
            <Button
              variant="danger"
              disabled={reason.length < 5 || act.isPending}
              onClick={() => act.mutate("pause_all_outbound")}
            >
              إيقاف الكل
            </Button>
            <Button
              variant="outline"
              disabled={reason.length < 5 || act.isPending}
              onClick={() => act.mutate("resume_all_outbound")}
            >
              استئناف الكل
            </Button>
          </div>
          {act.isError ? (
            <p className="text-ds-small text-destructive">{(act.error as Error).message}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-ds-h3">إيقاف / استئناف رقم محدد</CardTitle>
          <CardDescription>عند الشك بحظر رقم، أوقفه واستخدم رقمًا احتياطيًا.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-3">
          <Input
            placeholder="الرقم (+9627XXXXXXXX)"
            value={toNumber}
            onChange={(e) => setToNumber(e.target.value)}
          />
          <div className="flex gap-cg-2">
            <Button
              variant="danger"
              disabled={!toNumber || reason.length < 5 || act.isPending}
              onClick={() => act.mutate("pause_number")}
            >
              إيقاف الرقم
            </Button>
            <Button
              variant="outline"
              disabled={!toNumber || reason.length < 5 || act.isPending}
              onClick={() => act.mutate("resume_number")}
            >
              استئناف الرقم
            </Button>
            <Button
              variant="danger"
              disabled={!toNumber || reason.length < 5 || act.isPending}
              onClick={() => act.mutate("rotate_to_backup")}
            >
              تدوير للاحتياطي
            </Button>
          </div>
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-ds-body">
              <thead className="bg-muted text-ds-small">
                <tr>
                  <th className="px-cg-3 py-cg-2 text-start">الرقم</th>
                  <th className="px-cg-3 py-cg-2 text-start">الحالة</th>
                  <th className="px-cg-3 py-cg-2 text-start">السبب</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.numbers || []).map((n) => (
                  <tr key={n.to_number} className="border-t">
                    <td className="px-cg-3 py-cg-2 font-mono">{n.to_number}</td>
                    <td className="px-cg-3 py-cg-2">
                      <Badge variant={n.is_paused ? "danger" : "success"}>
                        {n.is_paused ? "متوقف" : "نشط"}
                      </Badge>
                    </td>
                    <td className="px-cg-3 py-cg-2 text-ds-small">{n.paused_reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
