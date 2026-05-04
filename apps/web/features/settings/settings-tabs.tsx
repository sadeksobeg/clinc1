"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { localizeApiError } from "@/lib/i18n/errors";

const clinicSchema = z.object({
  clinicName: z.string().min(2, "اسم العيادة مطلوب"),
  whatsappNumber: z.string().min(6, "أدخل رقمًا صحيحًا"),
  timezone: z.string().min(2, "المنطقة الزمنية مطلوبة"),
  language: z.string().min(2, "اللغة مطلوبة"),
});

type ClinicSettingsForm = z.infer<typeof clinicSchema>;
type DoctorRow = { id: number; display_name: string; specialty: string | null; slot_duration_minutes: number; is_active: boolean };
type DoctorHoursRow = { weekday: number; is_closed: boolean; opens_at: string; closes_at: string };
type DeepHealthPayload = {
  status?: string;
  postgres?: { ok?: boolean; latency_ms?: number; error?: string };
  redis?: { ok?: boolean; latency_ms?: number; error?: string };
  bridge?: { ok?: boolean; latency_ms?: number; status?: number; error?: string };
};

const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

function timeToMinutes(hhmm: string): number | null {
  const t = String(hhmm || "").trim();
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isIsoDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

export function SettingsTabs() {
  const [require2FA, setRequire2FA] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [holidaysText, setHolidaysText] = useState("");
  const [workingHours, setWorkingHours] = useState<Array<{ weekday: number; is_closed: boolean; opens_at: string; closes_at: string }> | null>(null);
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [doctorHoursById, setDoctorHoursById] = useState<Record<number, DoctorHoursRow[]>>({});
  const [doctorHoursBusy, setDoctorHoursBusy] = useState<Record<number, boolean>>({});
  const [health, setHealth] = useState<DeepHealthPayload | null>(null);
  const [healthUpdatedAt, setHealthUpdatedAt] = useState<string | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const form = useForm<ClinicSettingsForm>({
    resolver: zodResolver(clinicSchema),
    defaultValues: {
      clinicName: "",
      whatsappNumber: "",
      timezone: "",
      language: "ar",
    },
  });

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetchWithRetry("/api/ops/clinic-settings", { cache: "no-store" });
        const out = (await res.json()) as {
          ok?: boolean;
          clinic?: { name?: string; timezone?: string; metadata?: Record<string, unknown> };
          working_hours?: Array<{ weekday: number; is_closed: boolean; opens_at?: string | null; closes_at?: string | null }>;
          error?: string;
        };
        if (!out.ok || !out.clinic) return;

        form.reset({
          clinicName: out.clinic.name || "",
          timezone: out.clinic.timezone || "",
          language: typeof out.clinic.metadata?.language === "string" ? out.clinic.metadata.language : "ar",
          whatsappNumber: typeof out.clinic.metadata?.whatsapp_number === "string" ? out.clinic.metadata.whatsapp_number : "",
        });
        const fetchedHours = Array.isArray(out.working_hours) ? out.working_hours : [];
        setWorkingHours(
          fetchedHours.length > 0
            ? fetchedHours.map((h) => ({
                weekday: h.weekday,
                is_closed: h.is_closed,
                opens_at: (h.opens_at || "08:00").slice(0, 5),
                closes_at: (h.closes_at || "22:00").slice(0, 5),
              }))
            : Array.from({ length: 7 }).map((_, weekday) => ({
                weekday,
                is_closed: true,
                opens_at: "08:00",
                closes_at: "22:00",
              })),
        );
        if (Array.isArray(out.clinic.metadata?.holidays)) {
          setHolidaysText((out.clinic.metadata.holidays as unknown[]).filter((x): x is string => typeof x === "string").join("\n"));
        }
        setRequire2FA(Boolean(out.clinic.metadata?.require_2fa));
      } catch (e) {
        toast.error("تعذر تحميل الإعدادات.");
      } finally {
        setIsInitialLoading(false);
      }
    };
    void run();
  }, [form]);

  async function saveSettings(values: ClinicSettingsForm) {
    setIsSaving(true);
    try {
      if (!workingHours) {
        toast.error("لم يتم تحميل ساعات العمل بعد.");
        return;
      }
      const holidays = holidaysText
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      const badHoliday = holidays.find((d) => !isIsoDateOnly(d));
      if (badHoliday) {
        toast.error(`صيغة تاريخ الإجازة غير صحيحة: ${badHoliday} (استخدم YYYY-MM-DD)`);
        return;
      }

      for (const h of workingHours) {
        if (h.is_closed) continue;
        const o = timeToMinutes(h.opens_at);
        const c = timeToMinutes(h.closes_at);
        if (o == null || c == null) {
          toast.error(`تأكد من صيغة الوقت في ${WEEKDAY_AR[h.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6]}.`);
          return;
        }
        if (o >= c) {
          toast.error(`ساعات العمل غير منطقية في ${WEEKDAY_AR[h.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6]} (البداية يجب أن تكون قبل النهاية).`);
          return;
        }
      }

      const res = await fetchWithRetry("/api/ops/clinic-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.clinicName,
          timezone: values.timezone,
          holidays,
          working_hours: workingHours.map((h) => ({
            weekday: h.weekday,
            is_closed: h.is_closed,
            opens_at: h.is_closed ? null : `${h.opens_at}:00`,
            closes_at: h.is_closed ? null : `${h.closes_at}:00`,
          })),
          metadata: {
            whatsapp_number: values.whatsappNumber,
            language: values.language,
            require_2fa: require2FA,
            updated_from: "apps_web_settings",
          },
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر حفظ الإعدادات.");
        return;
      }
      toast.success("تم حفظ إعدادات العيادة.");
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshHealthAndDoctors() {
    setIsHealthLoading(true);
    try {
      const [doctorsRes, healthRes] = await Promise.all([
        fetchWithRetry("/api/ops/doctors", { cache: "no-store" }),
        fetchWithRetry("/api/ops/system/health/deep", { cache: "no-store" }),
      ]);
      const doctorsOut = (await doctorsRes.json().catch(() => ({}))) as { ok?: boolean; rows?: DoctorRow[] };
      if (doctorsOut.ok && Array.isArray(doctorsOut.rows)) setDoctors(doctorsOut.rows);
      const healthOut = (await healthRes.json().catch(() => ({}))) as DeepHealthPayload;
      setHealth(healthOut);
      setHealthUpdatedAt(new Date().toISOString());
    } catch {
      // non-blocking
    } finally {
      setIsHealthLoading(false);
    }
  }

  useEffect(() => {
    void refreshHealthAndDoctors();
  }, []);

  async function loadDoctorHours(doctorId: number) {
    if (!doctorId) return;
    if (doctorHoursBusy[doctorId]) return;
    setDoctorHoursBusy((p) => ({ ...p, [doctorId]: true }));
    try {
      const res = await fetchWithRetry(`/api/ops/doctors/${doctorId}/hours`, { cache: "no-store" });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        hours?: Array<{ weekday: number; opens_at?: string | null; closes_at?: string | null }>;
      };
      const next: DoctorHoursRow[] = Array.from({ length: 7 }).map((_, weekday) => {
        const row = out.ok && Array.isArray(out.hours) ? out.hours.find((x) => Number(x.weekday) === weekday) : undefined;
        return {
          weekday,
          is_closed: !row,
          opens_at: row?.opens_at ? String(row.opens_at).slice(0, 5) : "09:00",
          closes_at: row?.closes_at ? String(row.closes_at).slice(0, 5) : "21:00",
        };
      });
      setDoctorHoursById((p) => ({ ...p, [doctorId]: next }));
    } catch {
      toast.error("تعذر تحميل ساعات دوام الطبيب.");
    } finally {
      setDoctorHoursBusy((p) => ({ ...p, [doctorId]: false }));
    }
  }

  async function saveDoctorHours(doctorId: number) {
    const rows = doctorHoursById[doctorId];
    if (!doctorId || !rows) return;
    setDoctorHoursBusy((p) => ({ ...p, [doctorId]: true }));
    try {
      const res = await fetchWithRetry(`/api/ops/doctors/${doctorId}/hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: rows.map((r) => ({
            weekday: r.weekday,
            is_closed: r.is_closed,
            opens_at: r.is_closed ? null : `${r.opens_at}:00`,
            closes_at: r.is_closed ? null : `${r.closes_at}:00`,
          })),
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !out.ok) throw new Error("save_failed");
      toast.success("تم حفظ دوام الطبيب");
      await loadDoctorHours(doctorId);
    } catch {
      toast.error("تعذر حفظ دوام الطبيب.");
    } finally {
      setDoctorHoursBusy((p) => ({ ...p, [doctorId]: false }));
    }
  }

  return (
    <div className="glass-card rounded-2xl border border-border/80 p-cg-4">
      {isInitialLoading ? (
        <div className="mb-cg-4 flex flex-col gap-cg-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : null}
      <Tabs defaultValue="clinic">
        <TabsList className="mb-cg-4 flex-wrap">
          <TabsTrigger value="clinic">بيانات العيادة</TabsTrigger>
          <TabsTrigger value="hours">ساعات العمل</TabsTrigger>
          <TabsTrigger value="whatsapp">واتساب</TabsTrigger>
          <TabsTrigger value="doctors">الأطباء</TabsTrigger>
          <TabsTrigger value="security">الأمان</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic">
          <div className="mb-cg-3 rounded-xl border border-border/70 bg-muted/20 p-cg-3 text-ds-body text-muted-foreground">
            هذه البيانات تؤثر مباشرة على الهوية العامة للعيادة (الاسم/اللغة/المنطقة الزمنية) وعلى تنسيق الأوقات في المواعيد ورسائل واتساب.
          </div>
          <form
            onSubmit={form.handleSubmit(saveSettings)}
            className="grid gap-cg-4 md:grid-cols-2"
          >
            <Field label="اسم العيادة">
              <Input {...form.register("clinicName")} />
            </Field>
            <Field label="رقم واتساب">
              <Input {...form.register("whatsappNumber")} />
            </Field>
            <Field label="المنطقة الزمنية">
              <Input {...form.register("timezone")} />
            </Field>
            <Field label="اللغة">
              <Input {...form.register("language")} />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" disabled={isSaving}>
                <Save className="h-4 w-4" />
                {isSaving ? "جار الحفظ..." : "حفظ إعدادات العيادة"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="hours">
          <div className="mb-cg-3 rounded-xl border border-border/70 bg-muted/20 p-cg-3 text-ds-body text-muted-foreground">
            ساعات عمل العيادة تُستخدم كمرجع عام، وقد يعتمد عليها اقتراح المواعيد عند عدم ضبط دوام الطبيب.
          </div>
          <div className="grid gap-cg-2">
            {!workingHours ? (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-cg-4 text-ds-body text-muted-foreground">
                تعذر تحميل ساعات العمل.
              </div>
            ) : (
              workingHours
                .slice()
                .sort((a, b) => a.weekday - b.weekday)
                .map((row) => (
                  <div key={row.weekday} className="grid gap-cg-2 rounded-xl border border-border/70 p-cg-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                    <p className="font-medium">{WEEKDAY_AR[row.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6] || `اليوم رقم ${row.weekday}`}</p>
                    <Input
                      type="time"
                      value={row.opens_at}
                      onChange={(e) =>
                        setWorkingHours((cur) => (cur ? cur.map((x) => (x.weekday === row.weekday ? { ...x, opens_at: e.target.value } : x)) : cur))
                      }
                      disabled={row.is_closed}
                    />
                    <Input
                      type="time"
                      value={row.closes_at}
                      onChange={(e) =>
                        setWorkingHours((cur) => (cur ? cur.map((x) => (x.weekday === row.weekday ? { ...x, closes_at: e.target.value } : x)) : cur))
                      }
                      disabled={row.is_closed}
                    />
                    <Switch
                      checked={row.is_closed}
                      onCheckedChange={(v) =>
                        setWorkingHours((cur) => (cur ? cur.map((x) => (x.weekday === row.weekday ? { ...x, is_closed: v } : x)) : cur))
                      }
                    />
                  </div>
                ))
            )}
          </div>
          <Field label="الإجازات (تاريخ واحد بكل سطر بصيغة YYYY-MM-DD)">
            <Textarea rows={4} value={holidaysText} onChange={(e) => setHolidaysText(e.target.value)} placeholder="2026-05-01" />
          </Field>
          <Button variant="outline" onClick={form.handleSubmit(saveSettings)} disabled={isSaving}>
            حفظ ساعات العمل
          </Button>
        </TabsContent>
        <TabsContent value="whatsapp">
          <div className="mb-cg-3 rounded-xl border border-border/70 bg-muted/20 p-cg-3 text-ds-body text-muted-foreground">
            حالة الربط تعكس جاهزية خدمة الجسر لاستقبال/إرسال رسائل واتساب. إن كانت غير متصلة فلن تصل الرسائل للعيادة.
          </div>
          <SettingsRow title="الرقم المتصل" desc={form.watch("whatsappNumber")} />
          <SettingsRow title="مصدر الربط" desc="خدمة المعالجة الواردة في ops-dashboard" />
          <div className="mb-cg-3 rounded-xl border border-border/70 p-cg-4 text-ds-body">
            <div className="mb-cg-1 flex items-center justify-between">
              <p className="font-medium">حالة الربط (Bridge Health)</p>
              <Button variant="outline" size="sm" onClick={refreshHealthAndDoctors} disabled={isHealthLoading}>
                {isHealthLoading ? "جار التحديث..." : "تحديث الحالة"}
              </Button>
            </div>
            <p className="text-muted-foreground">
              الجسر:{" "}
              <span className={health?.bridge?.ok ? "text-emerald-500" : "text-danger"}>
                {health?.bridge?.ok ? "متصل" : "غير متصل"}
              </span>
              {" · "}
              HTTP: {health?.bridge?.status ?? "-"}
              {" · "}
              Latency: {health?.bridge?.latency_ms ?? "-"}ms
            </p>
            {healthUpdatedAt ? <p className="mt-cg-1 text-ds-small text-muted-foreground">آخر تحديث: {new Date(healthUpdatedAt).toLocaleString("ar")}</p> : null}
            {health?.bridge?.error ? <p className="mt-cg-1 text-ds-small text-danger">الخطأ: {health.bridge.error}</p> : null}
          </div>
          <Button variant="outline" onClick={form.handleSubmit(saveSettings)} disabled={isSaving}>
            حفظ إعدادات واتساب
          </Button>
        </TabsContent>
        <TabsContent value="doctors">
          <div className="flex flex-col gap-cg-3">
            <SettingsRow
              title="ملخص الأطباء"
              desc={`${doctors.filter((d) => d.is_active).length} نشط / ${doctors.length} إجمالي`}
            />
            <div className="rounded-xl border border-border/70 p-cg-3">
              <p className="mb-cg-2 text-ds-body font-medium">الأطباء الحاليون</p>
              <div className="flex flex-col gap-cg-2">
                {doctors.map((d) => (
                  <div key={d.id} className="rounded-lg bg-muted/40 p-cg-2 text-ds-small">
                    <p className="font-medium">{d.display_name}</p>
                    <p className="text-muted-foreground">
                      {d.specialty ?? "general"} · {d.slot_duration_minutes} دقيقة · {d.is_active ? "نشط" : "متوقف"}
                    </p>
                  </div>
                ))}
                {doctors.length === 0 ? <p className="text-ds-small text-muted-foreground">لا توجد بيانات أطباء.</p> : null}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 p-cg-3 text-ds-body">
              <p className="font-medium">دوام الأطباء (يؤثر على اقتراح المواعيد في واتساب)</p>
              <p className="mt-cg-1 text-ds-small text-muted-foreground">اضبط دوام كل طبيب (فتح/إغلاق + وقت البداية/النهاية لكل يوم).</p>
              <div className="mt-cg-3 flex flex-col gap-cg-3">
                {doctors.map((d) => {
                  const hours = doctorHoursById[d.id];
                  const busy = Boolean(doctorHoursBusy[d.id]);
                  return (
                    <div key={`hours-${d.id}`} className="rounded-xl border border-border/60 p-cg-3">
                      <div className="flex flex-wrap items-center justify-between gap-cg-2">
                        <div>
                          <p className="font-medium">{d.display_name}</p>
                          <p className="text-ds-small text-muted-foreground">{d.specialty || "عام"}</p>
                        </div>
                        <div className="flex items-center gap-cg-2">
                          <Button variant="outline" size="sm" onClick={() => void loadDoctorHours(d.id)} disabled={busy}>
                            تحميل الدوام
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void saveDoctorHours(d.id)} disabled={busy || !hours}>
                            حفظ الدوام
                          </Button>
                        </div>
                      </div>
                      {hours ? (
                        <div className="mt-cg-3 grid gap-cg-2">
                          {hours
                            .slice()
                            .sort((a, b) => a.weekday - b.weekday)
                            .map((row) => (
                              <div
                                key={`${d.id}-${row.weekday}`}
                                className="grid gap-cg-2 rounded-xl border border-border/50 p-cg-2 md:grid-cols-[1fr_auto_auto_auto] md:items-center"
                              >
                                <p className="font-medium">{WEEKDAY_AR[row.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6] || `اليوم رقم ${row.weekday}`}</p>
                                <Input
                                  type="time"
                                  value={row.opens_at}
                                  onChange={(e) =>
                                    setDoctorHoursById((prev) => ({
                                      ...prev,
                                      [d.id]: prev[d.id].map((x) => (x.weekday === row.weekday ? { ...x, opens_at: e.target.value } : x)),
                                    }))
                                  }
                                  disabled={row.is_closed}
                                />
                                <Input
                                  type="time"
                                  value={row.closes_at}
                                  onChange={(e) =>
                                    setDoctorHoursById((prev) => ({
                                      ...prev,
                                      [d.id]: prev[d.id].map((x) => (x.weekday === row.weekday ? { ...x, closes_at: e.target.value } : x)),
                                    }))
                                  }
                                  disabled={row.is_closed}
                                />
                                <Switch
                                  checked={row.is_closed}
                                  onCheckedChange={(v) =>
                                    setDoctorHoursById((prev) => ({
                                      ...prev,
                                      [d.id]: prev[d.id].map((x) => (x.weekday === row.weekday ? { ...x, is_closed: v } : x)),
                                    }))
                                  }
                                />
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="mt-cg-3 text-ds-small text-muted-foreground">اضغط “تحميل الدوام” لعرض ساعات الطبيب.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="security">
          <div className="mb-cg-3 rounded-xl border border-border/70 bg-muted/20 p-cg-3 text-ds-body text-muted-foreground">
            إعدادات الأمان تخص حسابات الإدارة داخل العيادة. ننصح بتفعيل التحقق الثنائي للحسابات الإدارية.
          </div>
          <ToggleRow title="إلزام التحقق الثنائي للمسؤولين" checked={require2FA} onCheckedChange={setRequire2FA} />
          <Button variant="outline" onClick={form.handleSubmit(saveSettings)} disabled={isSaving}>
            حفظ إعدادات الأمان
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-cg-1 block text-ds-body text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SettingsRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-cg-3 rounded-xl border border-border/70 p-cg-4">
      <p className="font-medium">{title}</p>
      <p className="text-ds-body text-muted-foreground">{desc}</p>
    </div>
  );
}

function ToggleRow({
  title,
  checked,
  onCheckedChange,
}: {
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="mb-cg-3 flex items-center justify-between rounded-xl border border-border/70 p-cg-4">
      <p className="text-ds-body">{title}</p>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
