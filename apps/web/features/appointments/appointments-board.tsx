"use client";

import Link from "next/link";
import { AlertCircle, AlertTriangle, Calendar, Clock, Download, LogIn, MoreHorizontal, Timer } from "lucide-react";
import { DateTime } from "luxon";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toClinicZoned } from "@/lib/format";
import {
  ARRIVAL_GRACE_MINUTES,
  ARRIVAL_REMIND_MINUTES,
  delayAlertOperationalText,
  noShowFollowupText,
  ratingRequestText,
  reminderBeforeAppointmentText,
} from "@/lib/clinic-message-templates";
import { isLateAfterGrace } from "@/lib/clinic-time";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { localizeApiError } from "@/lib/i18n/errors";
import { statusLabel } from "@/lib/i18n/status";
import { maxDelayMinutesForDoctorName } from "@/lib/queue-projection";
import { cn } from "@/lib/utils";
import type { AppointmentRow, DoctorRow, PatientRow } from "@/lib/ops-server";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import { toast } from "sonner";
import {
  appointmentIsActiveNow,
  appointmentOperationalStyle,
  arrivalLabel,
  copyText,
  formatSyncClock,
  relativeWindowLabel,
  sessionEndsInLabel,
  timeLabel,
  useClinicDayOperations,
  type DayHoursRow,
} from "@/features/appointments/use-clinic-day-operations";
import { canPerformAction } from "@/lib/clinic-brain/permissions";

type OfferedSlot = {
  starts_at: string;
  ends_at: string;
  doctor_id: number;
  doctor_name: string;
};

export function AppointmentsBoard({
  rows,
  doctors,
  patients,
  clinicTimezone,
  clinicWorkingHours,
  initialPatientId,
  initialDoctorId,
}: {
  rows: AppointmentRow[];
  doctors: DoctorRow[];
  patients: PatientRow[];
  clinicTimezone: string;
  clinicWorkingHours: unknown[];
  initialPatientId?: string;
  initialDoctorId?: string;
}) {
  const { density, workspaceMode } = useUiPreferences();
  const isCompact = density === "compact";
  const isDoctorMode = workspaceMode === "doctor";
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [dragId, setDragId] = useState<number | null>(null);
  const [bookingDoctorId, setBookingDoctorId] = useState<string>(() => {
    if (initialDoctorId) return initialDoctorId;
    return doctors[0] ? String(doctors[0].id) : "";
  });
  const [bookingPatientId, setBookingPatientId] = useState<string>(() => {
    if (initialPatientId) return initialPatientId;
    return patients[0] ? String(patients[0].id) : "";
  });
  const [bookingStartAt, setBookingStartAt] = useState("");
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState<OfferedSlot[]>([]);
  const [availabilityClosed, setAvailabilityClosed] = useState<string | null>(null);
  const [availabilityForDay, setAvailabilityForDay] = useState<string | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const quickBookRef = useRef<HTMLDivElement | null>(null);

  const ops = useClinicDayOperations({
    rows,
    doctors,
    clinicTimezone,
    clinicWorkingHours,
    doctorFilter,
    patients,
    shouldRefreshGuard: () => {
      if (isDoctorMode) return true;
      const box = quickBookRef.current;
      if (!box) return true;
      const ae = document.activeElement;
      return !ae || !box.contains(ae);
    },
  });

  const {
    appointments,
    lastSyncAt,
    apptElByIdRef,
    gridScrollRef,
    nowZoned,
    nowHour,
    todayKey,
    calendarDays,
    slotsForDay,
    setDoctorHours,
    projectionById,
    todayTimeline,
    todayOps,
    nextReminderMinutes,
    isApptBusy,
    patchAppointmentOptimistic,
    moveAppointment,
    cancelBooking,
    createAppointment,
    openPatientConversation,
    openPatientConversationWithDraft,
    sendOperationalToPatient,
    etaMinutesFor,
  } = ops;

  useEffect(() => {
    const id = Number(bookingDoctorId || 0);
    if (!id) return;
    void (async () => {
      const res = await fetchWithRetry(`/api/ops/doctors/${id}/hours`, { cache: "no-store" }).catch(() => null);
      const out = (await res?.json().catch(() => ({}))) as { ok?: boolean; hours?: DayHoursRow[] };
      if (out?.ok && Array.isArray(out.hours)) {
        const by = new Map<number, { opens_at?: string | null; closes_at?: string | null }>();
        for (const h of out.hours) by.set(Number(h.weekday), { opens_at: h.opens_at ?? null, closes_at: h.closes_at ?? null });
        const full: DayHoursRow[] = Array.from({ length: 7 }).map((_, weekday) => {
          const r = by.get(weekday);
          return {
            weekday,
            is_closed: !r,
            opens_at: r?.opens_at ?? null,
            closes_at: r?.closes_at ?? null,
          };
        });
        setDoctorHours(full);
        return;
      }
      setDoctorHours(null);
    })();
  }, [bookingDoctorId, setDoctorHours]);

  const doctorFilterOptions = useMemo(() => {
    const unique = Array.from(new Set(appointments.map((r) => r.doctor_name).filter(Boolean))) as string[];
    return ["all", ...unique];
  }, [appointments]);

  const filtered = useMemo(() => {
    if (doctorFilter === "all") return appointments;
    return appointments.filter((r) => r.doctor_name === doctorFilter);
  }, [appointments, doctorFilter]);

  async function createBooking() {
    if (!bookingDoctorId || !bookingPatientId || !bookingStartAt) {
      toast.error("يجب تحديد الطبيب والمريض ووقت البداية.");
      return;
    }
    setIsSubmittingBooking(true);
    try {
      const z = String(clinicTimezone || "UTC");
      const local = DateTime.fromISO(bookingStartAt, { zone: z });
      if (!local.isValid) {
        toast.error("وقت البداية غير صالح.");
        return;
      }
      const startsAt = local.toUTC().toISO()!;
      const out = await createAppointment({
        doctor_id: Number(bookingDoctorId),
        patient_id: Number(bookingPatientId),
        starts_at: startsAt,
      });
      if (!out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر إنشاء الحجز.");
        return;
      }
      const patientName =
        patients.find((p) => p.id === Number(bookingPatientId))?.display_name ?? "المريض";
      toast.success(
        `تم إنشاء الحجز لـ ${patientName} — ${local.setLocale("ar").toFormat("ccc d LLL yyyy · HH:mm")} (${z}).`,
      );
      setBookingStartAt("");
    } finally {
      setIsSubmittingBooking(false);
    }
  }

  async function checkAvailability() {
    if (!bookingDoctorId) {
      toast.error("اختر الطبيب أولًا.");
      return;
    }
    const z = String(clinicTimezone || "UTC");
    let dayKey = todayKey;
    if (bookingStartAt) {
      const p = DateTime.fromISO(bookingStartAt, { zone: z });
      if (p.isValid) dayKey = p.toISODate() ?? todayKey;
    }
    if (!dayKey) {
      toast.error("تعذر تحديد يوم العيادة.");
      return;
    }
    setIsLoadingAvailability(true);
    setAvailabilitySlots([]);
    setAvailabilityClosed(null);
    setAvailabilityForDay(dayKey);
    try {
      const res = await fetchWithRetry("/api/ops/appointments/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctor_id: Number(bookingDoctorId),
          limit: 12,
          day_key: dayKey,
        }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        slots?: unknown[];
        closed_message_ar?: string;
        error?: string;
      };
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر التحقق من المواعيد المتاحة.");
        return;
      }
      const raw = Array.isArray(out.slots) ? out.slots : [];
      const slots: OfferedSlot[] = [];
      for (const x of raw) {
        if (!x || typeof x !== "object") continue;
        const o = x as Record<string, unknown>;
        if (typeof o.starts_at !== "string" || typeof o.ends_at !== "string") continue;
        const docId = Number(o.doctor_id);
        if (!Number.isFinite(docId) || typeof o.doctor_name !== "string") continue;
        slots.push({
          starts_at: o.starts_at,
          ends_at: o.ends_at,
          doctor_id: docId,
          doctor_name: o.doctor_name,
        });
      }
      setAvailabilitySlots(slots);
      if (!slots.length) {
        setAvailabilityClosed(out.closed_message_ar ?? "لا توجد فتحات في هذا اليوم ضمن نافذة البحث.");
      }
    } catch {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setIsLoadingAvailability(false);
    }
  }

  const slotMap = useMemo(() => {
    const m = new Map<string, AppointmentRow[]>();
    filtered.forEach((appt) => {
      const local = toClinicZoned(appt.starts_at, clinicTimezone);
      if (!local) return;
      const key = `${local.toISODate()}-${local.hour}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)?.push(appt);
    });
    return m;
  }, [filtered, clinicTimezone]);

  /** صفوف الساعات: ساعات العمل + أي ساعة فيها موعد فعلي (يظهر الحجز حتى خارج نافذة slots الافتراضية). */
  const gridHours = useMemo(() => {
    const hours = new Set<number>();
    for (const day of calendarDays) {
      for (const h of slotsForDay(day)) hours.add(h);
    }
    for (const appt of filtered) {
      const local = toClinicZoned(appt.starts_at, clinicTimezone);
      if (!local) continue;
      const dayIso = local.toISODate();
      if (!calendarDays.some((d) => d.toISODate() === dayIso)) continue;
      hours.add(local.hour);
    }
    return Array.from(hours).sort((a, b) => a - b);
  }, [calendarDays, slotsForDay, filtered, clinicTimezone]);

  const doctorQueueSkew = useMemo(() => {
    if (!isDoctorMode) return null;
    const name =
      doctorFilter !== "all"
        ? doctorFilter
        : doctors.length === 1
          ? (doctors[0].display_name ?? null)
          : null;
    if (!name) return null;
    return maxDelayMinutesForDoctorName(projectionById, appointments, name);
  }, [isDoctorMode, doctorFilter, doctors, projectionById, appointments]);

  return (
    <div
      className={cn(
        "grid h-full min-h-0 flex-1 gap-cg-5 overflow-hidden",
        isDoctorMode ? "grid-cols-1" : "xl:grid-cols-[1fr_320px]",
      )}
    >
      <WorkspacePanel
        title="الجدول"
        subtitle={`المنطقة الزمنية: ${clinicTimezone || "UTC"}`}
        right={
          <div className="flex items-center gap-cg-2">
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="تصفية حسب الطبيب" />
              </SelectTrigger>
              <SelectContent>
                {doctorFilterOptions.map((doctor) => (
                  <SelectItem key={doctor} value={doctor}>
                    {doctor === "all" ? "كل الأطباء" : doctor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled>
              <Download className="h-4 w-4" />
              تصدير
            </Button>
          </div>
        }
        className="flex min-h-0 flex-col"
        contentClassName="flex min-h-0 flex-col p-cg-0"
      >
        <div className={cn("sticky top-0 z-10 border-b border-border/60 bg-background/70 backdrop-blur-sm", isCompact ? "px-cg-3 py-cg-2" : "px-cg-4 py-cg-3")}>
          <div className="flex flex-wrap items-center justify-between gap-cg-3">
            <Tabs defaultValue="week" className="w-full md:w-auto">
              <TabsList>
                <TabsTrigger value="day">اليوم</TabsTrigger>
                <TabsTrigger value="week">الأسبوع</TabsTrigger>
                <TabsTrigger value="month">الشهر</TabsTrigger>
              </TabsList>
              <TabsContent value="day" />
              <TabsContent value="week" />
              <TabsContent value="month" />
            </Tabs>
            <p className="text-ds-small text-muted-foreground">
              الآن: <span className="font-mono text-foreground">{nowZoned.setLocale("ar").toFormat("HH:mm")}</span>
              {lastSyncAt != null ? (
                <span className="ms-cg-2 text-ds-label">· آخر مزامنة {formatSyncClock(lastSyncAt)}</span>
              ) : null}
            </p>
          </div>

          {isDoctorMode && doctorQueueSkew != null ? (
            <div className="mt-cg-2 rounded-xl border border-warning/35 bg-warning/10 px-cg-3 py-cg-2 text-ds-small text-warning">
              <span className="font-medium">تأخر إسقاط الطابور:</span> حتى ~{doctorQueueSkew} دقيقة على بقية مواعيدك اليوم — يتحدّث تلقائيًا كل 30 ثانية وفق حالة الطابور.
            </div>
          ) : null}

          {!isDoctorMode ? (
          <div
            ref={quickBookRef}
            className={cn(
              "mt-cg-3 rounded-xl border border-border/50 bg-card/30 p-cg-3 shadow-sm",
              isCompact ? "space-y-cg-2" : "space-y-cg-3",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-cg-2 gap-y-cg-1 border-b border-border/45 pb-cg-2">
              <h3 className="text-ds-label font-semibold text-foreground">حجز سريع</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label="معلومات: التوقيت وقائمة المرضى"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[min(22rem,calc(100vw-2rem))] space-y-cg-2 text-start">
                  <p>
                    <span className="font-medium text-foreground">التوقيت:</span> قيمة «وقت البدء» تُفسَّر بتوقيت العيادة{" "}
                    <span className="font-mono text-foreground">{clinicTimezone || "UTC"}</span>.
                  </p>
                  <p>
                    <span className="font-medium text-foreground">المرضى:</span> القائمة من الخادم (حتى 500 مريض لهذه العيادة).
                    ظهور اسم واحد عادةً يعني وجود سجل واحد في البيانات، لا قيدًا في الواجهة.
                  </p>
                  <p className="border-t border-border/60 pt-cg-2">
                    <Link href="/patients" className="font-medium text-primary underline-offset-4 hover:underline">
                      إدارة المرضى
                    </Link>
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid gap-cg-2 sm:items-end lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <div className="flex min-w-0 flex-col gap-cg-1">
              <span id="quickbook-doctor-label" className="text-ds-label font-medium text-foreground">
                الطبيب
              </span>
              <Select value={bookingDoctorId} onValueChange={setBookingDoctorId}>
                <SelectTrigger aria-labelledby="quickbook-doctor-label">
                  <SelectValue placeholder="اختر الطبيب" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-cg-1">
              <span id="quickbook-patient-label" className="text-ds-label font-medium text-foreground">
                المريض
              </span>
              <Select value={bookingPatientId} onValueChange={setBookingPatientId}>
                <SelectTrigger aria-labelledby="quickbook-patient-label">
                  <SelectValue placeholder="اختر المريض" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.display_name ?? p.chat_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-cg-1">
              <span id="quickbook-start-label" className="text-ds-label font-medium text-foreground">
                وقت البدء
              </span>
              <Input
                id="quickbook-start"
                type="datetime-local"
                aria-labelledby="quickbook-start-label"
                value={bookingStartAt}
                onChange={(e) => setBookingStartAt(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={checkAvailability} disabled={isLoadingAvailability} className="w-full sm:w-auto">
              {isLoadingAvailability ? "جار التحقق..." : "المواعيد المتاحة"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={createBooking}
              disabled={isSubmittingBooking || !bookingDoctorId || !bookingPatientId || !bookingStartAt}
            >
              {isSubmittingBooking ? "جار الإنشاء..." : "إنشاء حجز"}
            </Button>
            {availabilityForDay && (availabilitySlots.length > 0 || availabilityClosed) ? (
              <div className="lg:col-span-5 rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent p-cg-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-cg-2">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                    <Calendar className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-ds-label font-semibold text-foreground">المواعيد المتاحة</p>
                    <p className="mt-cg-1 text-ds-small text-muted-foreground">
                      بحث من{" "}
                      <span className="font-medium text-foreground">
                        {DateTime.fromISO(availabilityForDay, { zone: clinicTimezone })
                          .setLocale("ar")
                          .toFormat("cccc d LLLL yyyy")}
                      </span>
                      · الفتحات التالية بحسب جدول الطبيب والحجوزات الحالية.
                    </p>
                  </div>
                </div>
                {availabilitySlots.length === 0 && availabilityClosed ? (
                  <p className="mt-cg-3 rounded-xl border border-border/70 bg-muted/30 p-cg-3 text-ds-body text-muted-foreground">
                    {availabilityClosed}
                  </p>
                ) : null}
                {availabilitySlots.length > 0 ? (
                  <ul className="mt-cg-3 grid list-none gap-cg-3 sm:grid-cols-2 lg:grid-cols-3">
                    {availabilitySlots.map((s) => {
                      const dt = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(clinicTimezone);
                      const end = DateTime.fromISO(s.ends_at, { zone: "utc" }).setZone(clinicTimezone);
                      const dIso = dt.toISODate();
                      const dayLabel =
                        dIso === todayKey ? "اليوم" : dt.setLocale("ar").toFormat("ccc d LLL");
                      return (
                        <li
                          key={`${s.starts_at}-${s.doctor_id}`}
                          className="flex flex-col gap-cg-2 rounded-2xl border border-border/80 bg-card/95 p-cg-3 shadow-sm ring-1 ring-border/40"
                        >
                          <div className="flex items-center justify-between gap-cg-2">
                            <div className="flex items-baseline gap-cg-1 font-mono tabular-nums">
                              <span className="font-mono text-ds-h3 font-semibold tabular-nums text-primary">{dt.toFormat("HH:mm")}</span>
                              <span className="text-ds-label text-muted-foreground">– {end.toFormat("HH:mm")}</span>
                            </div>
                            <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          </div>
                          <p className="text-ds-label text-muted-foreground">{dayLabel}</p>
                          <p className="text-ds-small font-medium text-foreground">{s.doctor_name}</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="w-full"
                            onClick={() => setBookingStartAt(dt.toFormat("yyyy-MM-dd'T'HH:mm"))}
                          >
                            اختيار هذا الوقت للحجز
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}
            </div>
          </div>
          ) : (
            <p className="mt-cg-3 text-ds-small text-muted-foreground">
              وضع الطبيب: جدول فقط — بدون حجز سريع من هنا.
            </p>
          )}

        </div>

        <div ref={gridScrollRef} className="flex-1 overflow-auto">
          <div className={cn("min-w-[900px]", isCompact ? "p-cg-3" : "p-cg-4")}>
            <div className="grid grid-cols-[70px_repeat(5,minmax(140px,1fr))] gap-cg-2 pb-cg-2">
              <div />
              {calendarDays.map((day) => {
                const isToday = day.toISODate() === todayKey;
                return (
                  <div
                    key={day.toISODate()}
                    className={cn(
                      "rounded-xl p-cg-2 text-center text-ds-small font-medium",
                      isToday ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "bg-muted/50",
                    )}
                  >
                    {day.setLocale("ar").toFormat("ccc dd LLL")}
                  </div>
                );
              })}
            </div>

            {Array.from(gridHours).map((hour) => {
              const rowLiveTimeline = calendarDays.some((d) => {
                const ds = slotsForDay(d);
                return d.toISODate() === todayKey && ds.includes(hour) && (hour === nowHour || hour === nowHour + 1);
              });
              return (
              <div
                key={hour}
                className={cn(
                  "grid grid-cols-[70px_repeat(5,minmax(140px,1fr))] gap-cg-2 py-cg-1 transition-[background-color,box-shadow] duration-300",
                  rowLiveTimeline
                    ? "rounded-xl bg-gradient-to-b from-primary/[0.08] via-primary/[0.025] to-transparent shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.15)]"
                    : "",
                )}
              >
                <div className="flex items-start justify-center pt-cg-2 text-ds-small text-muted-foreground">
                  <span
                    className={cn(
                      "rounded-md px-cg-1.5 py-cg-0.5 transition-opacity",
                      hour === nowHour ? "bg-primary/10 font-medium text-primary ring-1 ring-primary/25" : "",
                      hour < nowHour ? "opacity-40" : Math.abs(hour - nowHour) >= 4 ? "opacity-55" : "",
                    )}
                  >
                    {`${hour}:00`}
                  </span>
                </div>
                {calendarDays.map((day) => {
                  const daySlots = slotsForDay(day);
                  const disabled = !daySlots.includes(hour);
                  const key = `${day.toISODate()}-${hour}`;
                  const items = slotMap.get(key) ?? [];
                  const isToday = day.toISODate() === todayKey;
                  const isNowCell = isToday && hour === nowHour && !disabled;
                  const isPastSlot = isToday && !disabled && hour < nowHour;
                  const isNearWindow = isToday && !disabled && (hour === nowHour || hour === nowHour + 1);
                  return (
                    <div
                      key={key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = Number(e.dataTransfer.getData("appointment-id") || dragId);
                        if (disabled) return;
                        if (Number.isFinite(id)) void moveAppointment(id, day.toJSDate(), hour);
                        setDragId(null);
                      }}
                      className={cn(
                        "relative rounded-xl border border-dashed transition clinic-motion",
                        isCompact ? "min-h-14 p-cg-1.5" : "min-h-16 p-cg-2",
                        disabled ? "border-border/40 bg-muted/20 opacity-60" : "border-border/70 bg-background/70",
                        dragId && !disabled ? "hover:border-primary/60 hover:bg-primary/5" : "",
                        isPastSlot ? "opacity-[0.38] saturate-[0.92]" : "",
                        isNearWindow && !isPastSlot ? "bg-primary/[0.055]" : "",
                        isNowCell ? "ring-2 ring-primary/25 shadow-[inset_0_0_0_1px] shadow-primary/15" : "",
                        !isPastSlot && isToday && !disabled && Math.abs(hour - nowHour) >= 4 ? "opacity-80" : "",
                      )}
                    >
                      {!disabled && items.length > 1 ? (
                        <div className="pointer-events-none absolute end-2 top-2">
                          <Badge variant="warning">تداخل</Badge>
                        </div>
                      ) : null}
                      {isNowCell ? (
                        <div
                          className="pointer-events-none absolute inset-x-2 z-[1] h-[2px] rounded-full bg-primary/75 shadow-sm"
                          style={{ top: `calc(0.5rem + (${nowZoned.minute} / 60) * (100% - 1rem))` }}
                        />
                      ) : null}
                      <div className={cn("flex flex-col", isCompact ? "gap-cg-0.5" : "gap-cg-1")}>
                        {dragId && !disabled && items.length === 0 ? (
                          <p className="rounded-md border border-primary/25 bg-primary/5 px-cg-2 py-cg-1 text-ds-label text-primary">
                            إفلات هنا لإعادة الجدولة
                          </p>
                        ) : null}
                        {items.map((item) => {
                          const startLocal = toClinicZoned(item.starts_at, clinicTimezone);
                          const endLocal = toClinicZoned(item.ends_at, clinicTimezone);
                          const isEmergency = item.source_channel === "whatsapp_emergency";
                          const statusRaw = String(item.status || "").toLowerCase();
                          const arrivalRaw = String(item.patient_arrival_state || "").toLowerCase();
                          const isNow =
                            !disabled &&
                            startLocal != null &&
                            appointmentIsActiveNow(item, nowZoned, startLocal, endLocal);
                          const checkedInUi =
                            arrivalRaw === "checked_in" && statusRaw !== "cancelled" && statusRaw !== "completed";
                          const late =
                            !disabled &&
                            !isEmergency &&
                            statusRaw !== "cancelled" &&
                            statusRaw !== "completed" &&
                            startLocal != null &&
                            isLateAfterGrace(startLocal, nowZoned, ARRIVAL_GRACE_MINUTES);
                          const tone = appointmentOperationalStyle(item, {
                            isNow,
                            isLate: late,
                            checkedIn: checkedInUi,
                          });
                          const arrival = arrivalLabel(item.patient_arrival_state);
                          const canOperate = statusRaw !== "cancelled" && statusRaw !== "completed";
                          const minutesUntil =
                            startLocal != null ? Math.round(startLocal.diff(nowZoned, "minutes").minutes) : null;
                          const inReminderWindow =
                            Boolean(item.patient_id) &&
                            startLocal != null &&
                            minutesUntil != null &&
                            minutesUntil > 0 &&
                            minutesUntil <= ARRIVAL_REMIND_MINUTES;

                          const proj = day.toISODate() === todayKey ? projectionById.get(item.id) : undefined;

                          let showPrimary = false;
                          let primaryLabel = "";
                          let onPrimary: () => void = () => {};
                          if (canOperate) {
                            if (isEmergency) {
                              showPrimary = true;
                              primaryLabel = "استقبال فوري";
                              onPrimary = () =>
                                void patchAppointmentOptimistic(item.id, { patient_arrival_state: "checked_in" }, "استقبال طارئ", {
                                  source: "ui_surface",
                                });
                            } else if (checkedInUi && isNow) {
                              showPrimary = true;
                              primaryLabel = "إنهاء الكشف";
                              onPrimary = () =>
                                void patchAppointmentOptimistic(item.id, { status: "completed" }, "إنهاء الكشف", {
                                  source: "ui_surface",
                                  afterSuccess: async () => {
                                    const pid = item.patient_id;
                                    if (!pid) return;
                                    await sendOperationalToPatient(pid, ratingRequestText(), "التقييم", {
                                      type: "rating",
                                      appointmentId: item.id,
                                    });
                                  },
                                });
                            } else if (checkedInUi && !isNow) {
                              if (isDoctorMode && item.patient_id) {
                                showPrimary = true;
                                primaryLabel = "المحادثة";
                                onPrimary = () => void openPatientConversation(item.patient_id!);
                              }
                            } else if (isNow && !checkedInUi) {
                              showPrimary = true;
                              primaryLabel = "بدء الكشف";
                              onPrimary = () =>
                                void patchAppointmentOptimistic(item.id, { patient_arrival_state: "checked_in" }, "تسجيل الحضور", {
                                  source: "ui_surface",
                                });
                            } else {
                              showPrimary = true;
                              primaryLabel = "تسجيل الحضور";
                              onPrimary = () =>
                                void patchAppointmentOptimistic(item.id, { patient_arrival_state: "checked_in" }, "تسجيل الحضور", {
                                  source: "ui_surface",
                                });
                            }
                          }

                          const primaryIsFinish = primaryLabel === "إنهاء الكشف";
                          const primaryIsConversation = primaryLabel === "المحادثة";
                          const primaryVariant =
                            primaryIsConversation ? "outline" : primaryIsFinish || primaryLabel === "استقبال فوري" ? "default" : "secondary";

                          return (
                            <div
                              key={item.id}
                              draggable
                              ref={(node) => {
                                if (!node) {
                                  apptElByIdRef.current.delete(item.id);
                                  return;
                                }
                                apptElByIdRef.current.set(item.id, node);
                              }}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("appointment-id", String(item.id));
                                setDragId(item.id);
                              }}
                              className={cn(
                                "cursor-grab rounded-lg border active:cursor-grabbing transition-transform duration-150",
                                isCompact ? "p-cg-1.5" : "p-cg-2",
                                tone.bg,
                                tone.border,
                                tone.effects,
                                dragId === item.id ? "scale-[0.99] shadow-md ring-2 ring-primary/30" : "hover:shadow-sm",
                              )}
                            >
                              <div className="flex items-start justify-between gap-cg-2">
                                <div className="min-w-0">
                                  <p className="line-clamp-1 text-ds-small font-semibold">
                                    {item.patient_display_name ?? `#${item.patient_id ?? "?"}`}
                                  </p>
                                  <p className="mt-cg-0.5 line-clamp-1 text-ds-label text-muted-foreground">
                                    {item.doctor_name ?? "طبيب"}
                                  </p>
                                </div>
                                <div className={cn("shrink-0 rounded-md px-cg-1.5 py-cg-0.5 text-ds-label font-medium", tone.text)}>
                                  {timeLabel(startLocal)}–{timeLabel(endLocal)}
                                </div>
                              </div>
                              {proj ? (
                                <p
                                  className={cn(
                                    "mt-cg-1 text-ds-label",
                                    proj.delay_minutes >= 3 || proj.bucket === "NOW" ? "text-warning" : "text-muted-foreground",
                                  )}
                                >
                                  {proj.bucket === "NOW" ? (
                                    <>
                                      كشف جارٍ
                                      {proj.delay_minutes >= 3 ? ` · تأخير ~${proj.delay_minutes} د` : ""}
                                      {` · نهاية متوقعة ${proj.projected_end.setLocale("ar").toFormat("HH:mm")}`}
                                    </>
                                  ) : (
                                    <>
                                      متوقع البدء {proj.projected_start.setLocale("ar").toFormat("HH:mm")}
                                      {proj.delay_minutes >= 3 ? ` · تأخير ~${proj.delay_minutes} د` : ""}
                                    </>
                                  )}
                                </p>
                              ) : null}
                            {isNow || late ? (
                              <p className={cn("mt-cg-1 text-ds-label", late ? "text-warning" : "text-primary")}>
                                {startLocal ? relativeWindowLabel(nowZoned, startLocal) : null}
                              </p>
                            ) : null}
                              <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
                                {isEmergency ? <Badge variant="danger">طوارئ</Badge> : null}
                                {late ? <Badge variant="warning">متأخر</Badge> : null}
                                {arrival ? (
                                  <Badge variant={arrivalRaw === "checked_in" ? "success" : arrivalRaw === "late" ? "warning" : "secondary"}>
                                    {arrival}
                                  </Badge>
                                ) : null}
                                <Badge variant="outline" className="font-normal text-muted-foreground">
                                  {statusLabel(item.status)}
                                </Badge>
                                {showPrimary ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={primaryVariant}
                                    className="shrink-0"
                                    disabled={isApptBusy(item.id)}
                                    onClick={onPrimary}
                                  >
                                    {primaryLabel}
                                  </Button>
                                ) : null}
                                {canOperate ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 gap-cg-1 px-cg-2 text-muted-foreground hover:text-foreground"
                                        disabled={isApptBusy(item.id)}
                                      >
                                        <MoreHorizontal className="size-4 shrink-0 opacity-80" />
                                        <span className="text-ds-label">{isDoctorMode ? "المزيد" : "إجراءات"}</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="min-w-[13.5rem]">
                                      {arrivalRaw !== "late" ? (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            void patchAppointmentOptimistic(item.id, { patient_arrival_state: "late" }, "تعليم كمريض متأخر", {
                                              source: "ui_surface",
                                            })
                                          }
                                        >
                                          تعليم كمتأخر
                                        </DropdownMenuItem>
                                      ) : null}
                                      {!(isNow && checkedInUi) ? (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            void patchAppointmentOptimistic(item.id, { status: "completed" }, "إنهاء الكشف", {
                                              source: "ui_surface",
                                              afterSuccess: async () => {
                                                const pid = item.patient_id;
                                                if (!pid) return;
                                                await sendOperationalToPatient(pid, ratingRequestText(), "التقييم", {
                                                  type: "rating",
                                                  appointmentId: item.id,
                                                });
                                              },
                                            })
                                          }
                                        >
                                          إنهاء الكشف
                                        </DropdownMenuItem>
                                      ) : null}
                                      {item.patient_id ? (
                                        <DropdownMenuItem
                                          onClick={() => void openPatientConversationWithDraft(item.patient_id!, ratingRequestText())}
                                        >
                                          مسودة طلب التقييم
                                        </DropdownMenuItem>
                                      ) : null}
                                      {canPerformAction("no_show", item, { isNow }).allowed ? (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            void patchAppointmentOptimistic(
                                              item.id,
                                              { status: "no_show", patient_arrival_state: "no_show" },
                                              "تعليم كلم يحضر",
                                              {
                                                source: "ui_surface",
                                                afterSuccess: async () => {
                                                  const pid = item.patient_id;
                                                  if (!pid) return;
                                                  await sendOperationalToPatient(pid, noShowFollowupText(), "متابعة الغياب", {
                                                    type: "no_show_followup",
                                                    appointmentId: item.id,
                                                  });
                                                },
                                              },
                                            )
                                          }
                                        >
                                          لم يحضر
                                        </DropdownMenuItem>
                                      ) : null}
                                      {item.patient_id && canPerformAction("no_show", item, { isNow }).allowed ? (
                                        <DropdownMenuItem
                                          onClick={() => void openPatientConversationWithDraft(item.patient_id!, noShowFollowupText())}
                                        >
                                          مسودة عدم الحضور
                                        </DropdownMenuItem>
                                      ) : null}
                                      {!isDoctorMode && inReminderWindow && item.patient_id ? (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            void sendOperationalToPatient(
                                              item.patient_id!,
                                              reminderBeforeAppointmentText({ etaMinutes: etaMinutesFor(item.id) }),
                                              "التذكير",
                                              { type: "reminder", appointmentId: item.id },
                                            )
                                          }
                                        >
                                          إرسال تذكير قبل الموعد
                                        </DropdownMenuItem>
                                      ) : null}
                                      {!isDoctorMode && inReminderWindow && item.patient_id ? (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            void openPatientConversationWithDraft(
                                              item.patient_id!,
                                              reminderBeforeAppointmentText({ etaMinutes: etaMinutesFor(item.id) }),
                                            )
                                          }
                                        >
                                          مسودة التذكير
                                        </DropdownMenuItem>
                                      ) : null}
                                      {!isDoctorMode && item.patient_id ? (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            void sendOperationalToPatient(
                                              item.patient_id!,
                                              delayAlertOperationalText({ etaMinutes: etaMinutesFor(item.id) }),
                                              "تنبيه التأخير",
                                              { type: "delay", appointmentId: item.id },
                                            )
                                          }
                                        >
                                          إرسال تنبيه تأخير
                                        </DropdownMenuItem>
                                      ) : null}
                                      {!isDoctorMode && item.patient_id ? (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            void openPatientConversationWithDraft(
                                              item.patient_id!,
                                              delayAlertOperationalText({ etaMinutes: etaMinutesFor(item.id) }),
                                            )
                                          }
                                        >
                                          مسودة تنبيه التأخير
                                        </DropdownMenuItem>
                                      ) : null}
                                      {item.patient_id && !primaryIsConversation ? (
                                        <DropdownMenuItem onClick={() => void openPatientConversation(item.patient_id!)}>
                                          فتح المحادثة
                                        </DropdownMenuItem>
                                      ) : null}
                                      {canPerformAction("cancel", item, { isNow }).allowed ? (
                                        <DropdownMenuItem className="text-danger focus:text-danger" onClick={() => cancelBooking(item.id)}>
                                          إلغاء الحجز
                                        </DropdownMenuItem>
                                      ) : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
            })}
          </div>
        </div>
      </WorkspacePanel>

      {!isDoctorMode ? (
      <WorkspacePanel
        title="تشغيل اليوم"
        subtitle="الآن / التالي / الأولويات"
        className="flex min-h-0 flex-col"
        contentClassName="flex min-h-0 flex-col p-cg-4"
      >
        <div className="mb-cg-3 grid gap-cg-2">
          <div className="rounded-2xl border border-border/70 bg-background/70 p-cg-3 shadow-sm ring-1 ring-primary/10">
            <div className="flex items-center justify-between gap-cg-2">
              <div className="flex items-center gap-cg-2">
                <div className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Timer className="size-4" />
                </div>
                <div>
                  <p className="text-ds-label font-medium text-muted-foreground">الآن</p>
                  <p className="text-ds-body font-semibold text-foreground">
                    {todayTimeline.active ? todayTimeline.active.patient_display_name ?? "مريض غير معروف" : "—"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-ds-label text-muted-foreground">الوقت</p>
                <p className="font-mono text-ds-small text-foreground">{nowZoned.setLocale("ar").toFormat("HH:mm")}</p>
              </div>
            </div>
            {todayTimeline.active ? (
              <>
                <p className="mt-cg-2 text-ds-small text-muted-foreground">
                  {todayTimeline.active.doctor_name ?? "بدون طبيب"} · {statusLabel(todayTimeline.active.status)}
                </p>
                <p className="mt-cg-1 font-mono text-ds-label text-foreground">
                  {timeLabel(toClinicZoned(todayTimeline.active.starts_at, clinicTimezone))} –{" "}
                  {timeLabel(toClinicZoned(todayTimeline.active.ends_at, clinicTimezone))}
                </p>
                {(() => {
                  const p = projectionById.get(todayTimeline.active.id);
                  if (!p) return null;
                  return (
                    <p
                      className={cn(
                        "mt-cg-1 text-ds-label",
                        p.delay_minutes >= 3 || p.bucket === "NOW" ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {p.bucket === "NOW" ? (
                        <>
                          كشف جارٍ
                          {p.delay_minutes >= 3 ? ` · تأخير ~${p.delay_minutes} د` : ""}
                          {` · نهاية متوقعة ${p.projected_end.setLocale("ar").toFormat("HH:mm")}`}
                        </>
                      ) : (
                        <>
                          متوقع البدء {p.projected_start.setLocale("ar").toFormat("HH:mm")}
                          {p.delay_minutes >= 3 ? ` · تأخير ~${p.delay_minutes} د` : ""}
                        </>
                      )}
                    </p>
                  );
                })()}
                {(() => {
                  const endL = toClinicZoned(todayTimeline.active.ends_at, clinicTimezone);
                  const lab = sessionEndsInLabel(nowZoned, endL);
                  return lab ? (
                    <p className="mt-cg-1 text-ds-label font-semibold text-primary">{lab}</p>
                  ) : null;
                })()}
                {String(todayTimeline.active.status || "").toLowerCase() !== "cancelled" &&
                String(todayTimeline.active.status || "").toLowerCase() !== "completed" ? (
                  <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
                    {(() => {
                      const act = todayTimeline.active!;
                      const actArrival = String(act.patient_arrival_state || "").toLowerCase();
                      const actCheckedIn = actArrival === "checked_in";
                      return (
                        <>
                          {!actCheckedIn ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={isApptBusy(act.id)}
                              onClick={() =>
                                patchAppointmentOptimistic(act.id, { patient_arrival_state: "checked_in" }, "تسجيل الحضور", {
                                  source: "ui_surface",
                                })
                              }
                            >
                              بدء الكشف
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              disabled={isApptBusy(act.id)}
                              onClick={() =>
                                patchAppointmentOptimistic(act.id, { status: "completed" }, "إنهاء الكشف", {
                                  source: "ui_surface",
                                  afterSuccess: async () => {
                                    const pid = act.patient_id ?? null;
                                    if (!pid) return;
                                    await sendOperationalToPatient(pid, ratingRequestText(), "التقييم", {
                                      type: "rating",
                                      appointmentId: act.id,
                                    });
                                  },
                                })
                              }
                            >
                              إنهاء الكشف
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-cg-1 px-cg-2 text-muted-foreground hover:text-foreground"
                                disabled={isApptBusy(act.id)}
                              >
                                <MoreHorizontal className="size-4 shrink-0 opacity-80" />
                                <span className="text-ds-label">المزيد</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[12rem]">
                              {!actCheckedIn ? (
                                <DropdownMenuItem
                                  disabled={isApptBusy(act.id)}
                                  onClick={() =>
                                    void patchAppointmentOptimistic(act.id, { status: "completed" }, "إنهاء الكشف", {
                                      source: "ui_surface",
                                      afterSuccess: async () => {
                                        const pid = act.patient_id ?? null;
                                        if (!pid) return;
                                        await sendOperationalToPatient(pid, ratingRequestText(), "التقييم", {
                                          type: "rating",
                                          appointmentId: act.id,
                                        });
                                      },
                                    })
                                  }
                                >
                                  إنهاء الكشف
                                </DropdownMenuItem>
                              ) : null}
                              {act.patient_id ? (
                                <DropdownMenuItem
                                  onClick={() => void openPatientConversationWithDraft(act.patient_id!, ratingRequestText())}
                                >
                                  مسودة طلب التقييم
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-cg-2 text-ds-small text-muted-foreground">لا يوجد موعد جارٍ الآن.</p>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/30 p-cg-3">
            <div className="flex items-center gap-cg-2">
              <div className="grid size-8 place-items-center rounded-xl bg-muted text-foreground">
                <Clock className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-ds-label font-medium text-muted-foreground">التالي</p>
                <p className="truncate text-ds-body font-semibold text-foreground">
                  {todayTimeline.next ? todayTimeline.next.patient_display_name ?? "مريض غير معروف" : "—"}
                </p>
              </div>
              <div className="ms-auto text-right">
                <p className="text-ds-label text-muted-foreground">الوقت</p>
                <p className="font-mono text-ds-small text-foreground">
                  {todayTimeline.next ? timeLabel(toClinicZoned(todayTimeline.next.starts_at, clinicTimezone)) : "—"}
                </p>
                {todayTimeline.next ? (() => {
                  const p = projectionById.get(todayTimeline.next!.id);
                  if (!p) return null;
                  return (
                    <p
                      className={cn(
                        "mt-cg-1 text-ds-label",
                        p.delay_minutes >= 3 ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      متوقع البدء {p.projected_start.setLocale("ar").toFormat("HH:mm")}
                      {p.delay_minutes >= 3 ? ` · تأخير ~${p.delay_minutes} د` : ""}
                    </p>
                  );
                })() : null}
              </div>
            </div>
            {todayTimeline.next ? (
              <p className="mt-cg-2 text-ds-small text-muted-foreground">{todayTimeline.next.doctor_name ?? "بدون طبيب"}</p>
            ) : (
              <p className="mt-cg-2 text-ds-small text-muted-foreground">لا يوجد موعد قادم اليوم.</p>
            )}
            {todayTimeline.serveNext &&
            todayTimeline.calendarNext &&
            todayTimeline.serveNext.id !== todayTimeline.calendarNext.id ? (
              <div className="mt-cg-2 rounded-lg border border-warning/45 bg-warning/10 p-cg-2 text-ds-small text-warning">
                <p className="font-medium">⚠️ التالي تشغيلي ≠ التقويمي — تأكد قبل النداء.</p>
                <p className="mt-cg-1 text-ds-label">
                  أقرب موعد على الجدول:{" "}
                  <span className="font-mono text-foreground">
                    {timeLabel(toClinicZoned(todayTimeline.calendarNext.starts_at, clinicTimezone))}
                  </span>{" "}
                  ({todayTimeline.calendarNext.patient_display_name ?? "مريض"})
                </p>
              </div>
            ) : null}
            {nextReminderMinutes != null ? (
              <div className="mt-cg-2 rounded-lg border border-info/40 bg-info/10 p-cg-2">
                <p className="text-ds-small text-foreground">
                  يرجى تذكير المريض بالحضور قبل {ARRIVAL_REMIND_MINUTES} دقيقة
                  {nextReminderMinutes <= 5 ? " — الموعد قريب جدًا." : ""}
                </p>
                <div className="mt-cg-2 flex flex-wrap gap-cg-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const text = reminderBeforeAppointmentText({
                        etaMinutes: etaMinutesFor(todayTimeline.next?.id ?? null),
                      });
                      const pid = todayTimeline.next?.patient_id ?? null;
                      if (!pid) return void copyText(text);
                      await sendOperationalToPatient(pid, text, "التذكير", {
                        type: "reminder",
                        appointmentId: todayTimeline.next?.id ?? null,
                      });
                    }}
                  >
                    إرسال تذكير
                  </Button>
                  {todayTimeline.next?.patient_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void openPatientConversationWithDraft(
                          todayTimeline.next!.patient_id!,
                          reminderBeforeAppointmentText({ etaMinutes: etaMinutesFor(todayTimeline.next?.id ?? null) }),
                        )
                      }
                    >
                      فتح المحادثة مع مسودة
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-cg-3">
            <div className="rounded-2xl border border-danger/45 bg-gradient-to-b from-danger/[0.07] to-transparent p-cg-3 shadow-sm">
              <div className="mb-cg-2 flex items-center justify-between gap-cg-2">
                <p className="text-ds-small font-semibold text-foreground">
                  <span className="me-1.5" aria-hidden>
                    🔥
                  </span>
                  طوارئ
                </p>
                <Badge variant={todayOps.emergencies.length ? "danger" : "secondary"}>{todayOps.emergencies.length}</Badge>
              </div>
              <div className="space-y-cg-2">
                {todayOps.emergencies.slice(0, 6).map(({ a, st }) => (
                  <div key={a.id} className="rounded-xl border border-danger/60 bg-danger/10 p-cg-3">
                    <div className="flex items-center justify-between gap-cg-2">
                      <p className="text-ds-body font-semibold text-foreground">{a.patient_display_name ?? "مريض غير معروف"}</p>
                      <span className="font-mono text-ds-small text-foreground">{timeLabel(st)}</span>
                    </div>
                    <p className="mt-cg-1 text-ds-small text-muted-foreground">{a.doctor_name ?? "بدون طبيب"}</p>
                    <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
                      <Badge variant="danger">طوارئ</Badge>
                      <Badge variant="outline">{statusLabel(a.status)}</Badge>
                    </div>
                  </div>
                ))}
                {todayOps.emergencies.length === 0 ? <p className="text-ds-body text-muted-foreground">لا توجد طوارئ الآن.</p> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-warning/45 bg-gradient-to-b from-warning/[0.06] to-transparent p-cg-3 shadow-sm">
              <div className="mb-cg-2 flex items-center justify-between gap-cg-2">
                <p className="text-ds-small font-semibold text-foreground">
                  <span className="me-1.5" aria-hidden>
                    ⚠️
                  </span>
                  متأخرون
                </p>
                <Badge variant={todayOps.lateItems.length ? "warning" : "secondary"}>{todayOps.lateItems.length}</Badge>
              </div>
              <div className="space-y-cg-2">
                {todayOps.lateItems.slice(0, 6).map(({ a, st }) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-warning/50 bg-warning/10 p-cg-3"
                  >
                    <div className="flex items-center justify-between gap-cg-2">
                      <p className="text-ds-body font-semibold text-foreground">{a.patient_display_name ?? "مريض غير معروف"}</p>
                      <div className="flex items-center gap-cg-1">
                        <AlertTriangle className="size-4 text-warning" />
                        <span className="font-mono text-ds-small text-foreground">{timeLabel(st)}</span>
                      </div>
                    </div>
                    <p className="mt-cg-1 text-ds-small text-muted-foreground">{a.doctor_name ?? "بدون طبيب"}</p>
                    <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
                      <Badge variant="warning">متأخر</Badge>
                      <Badge variant="outline">{statusLabel(a.status)}</Badge>
                    </div>
                  </div>
                ))}
                {todayOps.lateItems.length === 0 ? <p className="text-ds-body text-muted-foreground">لا يوجد متأخرون الآن.</p> : null}
                {todayOps.lateItems.length > 0 ? (
                  <div className="mt-cg-2 rounded-lg border border-border/60 bg-muted/30 p-cg-2">
                    <p className="text-ds-label text-muted-foreground">
                      اقتراح تشغيلي: أبلغ المريض التالي باحتمال التأخير (بدون أتمتة حالياً).
                    </p>
                    {todayOps.upcomingItems[0]?.a ? (
                      <p className="mt-cg-1 text-ds-small text-muted-foreground">
                        المستهدف: <span className="font-medium text-foreground">{todayOps.upcomingItems[0].a.patient_display_name ?? "مريض"}</span>
                        {" · "}
                        <span className="font-mono text-foreground">{timeLabel(todayOps.upcomingItems[0].st)}</span>
                      </p>
                    ) : null}
                    <div className="mt-cg-2 flex flex-wrap gap-cg-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const target = todayOps.upcomingItems[0]?.a ?? todayTimeline.next ?? null;
                          const text = delayAlertOperationalText({ etaMinutes: etaMinutesFor(target?.id ?? null) });
                          const pid = target?.patient_id ?? null;
                          if (!pid) return void copyText(text);
                          await sendOperationalToPatient(pid, text, "تنبيه التأخير", {
                            type: "delay",
                            appointmentId: target?.id ?? null,
                          });
                        }}
                      >
                        إرسال تنبيه التأخير
                      </Button>
                      {todayOps.upcomingItems[0]?.a.patient_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void openPatientConversationWithDraft(
                              todayOps.upcomingItems[0]!.a.patient_id!,
                              delayAlertOperationalText({ etaMinutes: etaMinutesFor(todayOps.upcomingItems[0]!.a.id) }),
                            )
                          }
                        >
                          فتح المحادثة مع مسودة
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-success/40 bg-gradient-to-b from-success/[0.05] to-transparent p-cg-3 shadow-sm">
              <div className="mb-cg-2 flex items-center justify-between gap-cg-2">
                <p className="text-ds-small font-semibold text-foreground">
                  <span className="me-1.5" aria-hidden>
                    🟢
                  </span>
                  داخل العيادة
                </p>
                <Badge variant={todayOps.checkedInItems.length ? "success" : "secondary"}>{todayOps.checkedInItems.length}</Badge>
              </div>
              <div className="space-y-cg-2">
                {todayOps.checkedInItems.slice(0, 6).map(({ a, st }) => (
                  <div key={a.id} className="rounded-xl border border-border/70 bg-background/70 p-cg-3">
                    <div className="flex items-center justify-between gap-cg-2">
                      <p className="text-ds-body font-semibold text-foreground">{a.patient_display_name ?? "مريض غير معروف"}</p>
                      <div className="flex items-center gap-cg-1 text-success">
                        <LogIn className="size-4" />
                        <span className="font-mono text-ds-small text-foreground">{timeLabel(st)}</span>
                      </div>
                    </div>
                    <p className="mt-cg-1 text-ds-small text-muted-foreground">{a.doctor_name ?? "بدون طبيب"}</p>
                    <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
                      <Badge variant="success">داخل</Badge>
                      <Badge variant="outline">{statusLabel(a.status)}</Badge>
                    </div>
                  </div>
                ))}
                {todayOps.checkedInItems.length === 0 ? (
                  <p className="text-ds-body text-muted-foreground">لا يوجد مرضى مسجّلين دخولهم الآن.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/25 p-cg-3 shadow-sm">
              <div className="mb-cg-2 flex items-center justify-between gap-cg-2">
                <p className="text-ds-small font-semibold text-foreground">
                  <span className="me-1.5" aria-hidden>
                    📅
                  </span>
                  باقي اليوم
                </p>
                <Badge variant="secondary">{todayOps.upcomingItems.length}</Badge>
              </div>
              <div className="space-y-cg-2">
                {todayOps.upcomingItems.slice(0, 10).map(({ a, st, isEmergency }) => (
                  <div
                    key={a.id}
                    className={cn("rounded-xl p-cg-3", isEmergency ? "border border-danger/50 bg-danger/10" : "bg-muted/40")}
                  >
                    <div className="flex items-center justify-between gap-cg-2">
                      <p className="text-ds-body font-medium text-foreground">{a.patient_display_name ?? "مريض غير معروف"}</p>
                      <span className="font-mono text-ds-small text-foreground">{timeLabel(st)}</span>
                    </div>
                    <p className="mt-cg-1 text-ds-small text-muted-foreground">{a.doctor_name ?? "بدون طبيب"}</p>
                    <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
                      {isEmergency ? <Badge variant="danger">طوارئ</Badge> : null}
                      <Badge variant="outline">{statusLabel(a.status)}</Badge>
                    </div>
                  </div>
                ))}
                {todayOps.upcomingItems.length === 0 ? (
                  <p className="text-ds-body text-muted-foreground">لا توجد مواعيد قادمة اليوم (حسب الفلتر الحالي).</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </WorkspacePanel>
      ) : null}
    </div>
  );
}
