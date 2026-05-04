"use client";

import { DateTime } from "luxon";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { clinicWeekdayDb0Sun, toClinicZoned } from "@/lib/format";
import {
  ARRIVAL_GRACE_MINUTES,
  ARRIVAL_REMIND_MINUTES,
  delayAlertOperationalText,
  noShowFollowupText,
} from "@/lib/clinic-message-templates";
import { nowInClinicTZ } from "@/lib/clinic-time";
import {
  createActiveOperationalSession,
  deriveOperationalSessionPhase,
  getSessionTimeoutSuggestion,
  type ActiveOperationalSession,
} from "@/lib/clinic-operational-session";
import { appendOperationalEvent, inferToStateAfterSuccessfulTransition } from "@/lib/operational-event-log";
import { assertPatchSourceAllowed } from "@/lib/operational-patch-policy";
import { assertOperationalTransitionAllowed, type OperationalTransition } from "@/lib/clinic-operational-transitions";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { localizeApiError } from "@/lib/i18n/errors";
import { logOperationalAction, tryWithEntityLock } from "@/lib/operational-safety";
import {
  appointmentIsActiveNow,
  isCancelledStatus,
  isCompletedStatus,
  isEmergencyAppointmentRow,
} from "@/lib/operational-appointment";
import {
  buildDayQueueEngineState,
  DEFAULT_VISIT_MINUTES,
  groupEnrichedForOpsPanels,
  type EnrichedDayAppointment,
} from "@/lib/scheduling-engine";
import {
  getEffectiveDurationForProjection,
  rememberCheckInAtBrowser,
  recordCompletedVisitMinutes,
  takeCheckInTimestampMs,
} from "@/lib/doctor-duration-learning";
import { projectQueueTimelineForDay, type ProjectedSlot } from "@/lib/queue-projection";
import { usePeriodicRefresh } from "@/hooks/usePeriodicRefresh";
import type { AppointmentRow, DoctorRow, PatientRow } from "@/lib/ops-server";
import {
  canSendMessage,
  guardDeniedMessage,
  idempotencyKey as brainIdempotencyKey,
  recordMessageSent,
  type ClinicMessageType,
} from "@/lib/clinic-brain/messaging";
import { appendLog as brainAppendLog } from "@/lib/clinic-brain/logging";
import { canPerformAction, permissionMessage } from "@/lib/clinic-brain/permissions";
import { loadLevel, pickNextToCall, type LoadSnapshot } from "@/lib/clinic-brain/selection";
import {
  brainCallNextSuggestion,
  buildBrainSuggestions,
  enrichProjectionsForDay,
  evaluateSla,
  type AppointmentProjection,
  type BrainSuggestion,
  type OperationalMode,
  type SlaSuggestion,
} from "@/lib/clinic-brain/v2";

export const OPERATIONAL_FETCH_TIMEOUT_MS = 12_000;

export type DayHoursRow = {
  weekday: number;
  is_closed: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
};

export type AppointmentPatch = {
  status?: "pending" | "confirmed" | "cancelled" | "no_show" | "completed";
  patient_arrival_state?: "expected" | "late" | "checked_in" | "no_show";
};

export function parseHour(hhmmss: string | null | undefined): number | null {
  const s = String(hhmmss || "").slice(0, 5);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh + (mm >= 30 ? 1 : 0);
}

export function timeLabel(dt: DateTime | null | undefined): string {
  if (!dt || !dt.isValid) return "—";
  return dt.setLocale("ar").toFormat("HH:mm");
}

export function relativeWindowLabel(now: DateTime, start: DateTime): string | null {
  const mins = Math.round(start.diff(now, "minutes").minutes);
  if (!Number.isFinite(mins)) return null;
  if (mins > 0 && mins <= 90) return `يبدأ خلال ${mins} د`;
  if (mins === 0) return "يبدأ الآن";
  if (mins < 0 && mins >= -90) return `متأخر ${Math.abs(mins)} د`;
  return null;
}

export function sessionEndsInLabel(now: DateTime, end: DateTime | null): string | null {
  if (!end || !end.isValid) return null;
  const mins = Math.round(end.diff(now, "minutes").minutes);
  if (!Number.isFinite(mins)) return null;
  if (mins < 0) return "انتهى الوقت";
  if (mins === 0) return "ينتهي الآن";
  if (mins <= 120) return `ينتهي خلال ${mins} د`;
  return null;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("تم النسخ");
  } catch {
    toast.error("تعذر النسخ. انسخ النص يدويًا.");
  }
}

export async function sendConversationReply(conversationId: number, text: string, idempotencyKey: string) {
  const res = await fetchWithRetry(
    `/api/ops/conversations/${conversationId}/reply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, idempotency_key: idempotencyKey }),
    },
    { timeoutMs: OPERATIONAL_FETCH_TIMEOUT_MS },
  );
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !out.ok) throw new Error(out.error || "تعذر الإرسال");
}

export function formatSyncClock(ms: number): string {
  return DateTime.fromMillis(ms).setLocale("ar").toFormat("HH:mm:ss");
}

export {
  appointmentOperationalStyle,
  appointmentIsActiveNow,
  isCancelledStatus,
  isCompletedStatus,
} from "@/lib/operational-appointment";

export function arrivalLabel(state: string | null | undefined): string | null {
  const s = String(state || "").toLowerCase();
  if (s === "checked_in") return "داخل";
  if (s === "late") return "متأخر";
  if (s === "no_show") return "لم يحضر";
  if (s === "expected") return "منتظر";
  return null;
}

export type OpsRow = {
  a: AppointmentRow;
  st: DateTime;
  isEmergency: boolean;
  statusRaw: string;
  arrivalRaw: string;
  late: boolean;
  checkedIn: boolean;
  upcoming: boolean;
};

export function mapEnrichedToOpsRow(e: EnrichedDayAppointment): OpsRow {
  return {
    a: e.appointment,
    st: e.localStart,
    isEmergency: e.bucket === "EMERGENCY",
    statusRaw: String(e.appointment.status || "").toLowerCase(),
    arrivalRaw: String(e.appointment.patient_arrival_state || "").toLowerCase(),
    late: e.bucket === "LATE",
    checkedIn: e.bucket === "NOW" || e.bucket === "READY",
    upcoming: e.bucket === "UPCOMING",
  };
}

function checkInContextForAppointment(
  a: AppointmentRow,
  nowZoned: DateTime,
  clinicTimezone: string,
): { isNow: boolean } {
  const st = toClinicZoned(a.starts_at, clinicTimezone);
  const en = toClinicZoned(a.ends_at, clinicTimezone);
  const isNow = Boolean(st && appointmentIsActiveNow(a, nowZoned, st, en));
  return { isNow };
}

function pickFallbackCallAppointment(
  todayOps: {
    emergencies: OpsRow[];
    lateItems: OpsRow[];
    upcomingItems: OpsRow[];
  },
  nowZoned: DateTime,
  clinicTimezone: string,
): AppointmentRow | null {
  if (todayOps.emergencies[0]) return todayOps.emergencies[0].a;
  if (todayOps.lateItems[0]) return todayOps.lateItems[0].a;
  for (const r of todayOps.upcomingItems) {
    const ctx = checkInContextForAppointment(r.a, nowZoned, clinicTimezone);
    if (canPerformAction("check_in", r.a, ctx).allowed) return r.a;
  }
  return null;
}

export type ClinicDayOperationsOptions = {
  rows: AppointmentRow[];
  doctors: DoctorRow[];
  clinicTimezone: string;
  clinicWorkingHours: unknown[];
  doctorFilter?: string;
  /** optional patient list — used for WhatsApp Web fallback when there is no in-app conversation. */
  patients?: PatientRow[];
  /** optional guard: return false to skip the periodic refresh (e.g. when a form is focused). */
  shouldRefreshGuard?: () => boolean;
  /** if true, auto-scrolls apptElByIdRef target into view when active/serveNext changes. */
  autoFocusActive?: boolean;
};

export type ClinicDayOperationsResult = {
  appointments: AppointmentRow[];
  setAppointments: React.Dispatch<React.SetStateAction<AppointmentRow[]>>;
  appointmentsRef: React.MutableRefObject<AppointmentRow[]>;
  lastSyncAt: number | null;
  learningVersion: number;
  nowTick: number;
  busyAppointmentIds: number[];
  isApptBusy: (id: number) => boolean;
  apptElByIdRef: React.MutableRefObject<Map<number, HTMLElement>>;
  gridScrollRef: React.MutableRefObject<HTMLDivElement | null>;
  pushApptBusy: (id: number) => void;
  popApptBusy: (id: number) => void;
  nowZoned: DateTime;
  nowHour: number;
  todayKey: string | null;
  calendarDays: DateTime[];
  slotsForDay: (day: DateTime) => number[];
  effectiveHoursByWeekday: Map<number, DayHoursRow>;
  clinicHoursNormalized: Map<number, DayHoursRow>;
  doctorHours: DayHoursRow[] | null;
  setDoctorHours: React.Dispatch<React.SetStateAction<DayHoursRow[] | null>>;
  dayList: { a: AppointmentRow; local: DateTime }[];
  queueEngine: ReturnType<typeof buildDayQueueEngineState>;
  projectionById: Map<number, ProjectedSlot>;
  todayTimeline: {
    list: { a: AppointmentRow; local: DateTime }[];
    active: AppointmentRow | null;
    next: AppointmentRow | null;
    serveNext: AppointmentRow | null;
    calendarNext: AppointmentRow | null;
  };
  todayOps: {
    emergencies: OpsRow[];
    lateItems: OpsRow[];
    checkedInItems: OpsRow[];
    upcomingItems: OpsRow[];
  };
  nextReminderMinutes: number | null;
  getDoctorSlotMinutes: (doctorId: number | null) => number;
  softRefresh: () => void;
  captureGridScroll: () => void;
  patchAppointmentOptimistic: (
    appointmentId: number,
    patch: AppointmentPatch,
    actionLabel: string,
    opts?: { afterSuccess?: () => void | Promise<void>; source?: string },
  ) => Promise<void>;
  moveAppointment: (appointmentId: number, targetDate: Date, targetHour: number) => Promise<void>;
  cancelBooking: (appointmentId: number) => Promise<void>;
  createAppointment: (args: {
    doctor_id: number;
    patient_id: number;
    starts_at: string;
    conversation_id?: number;
    idempotency_key?: string;
  }) => Promise<{ ok: boolean; error?: string; appointment_id?: number }>;
  conversationIdForPatient: (patientId: number) => Promise<number | null>;
  openPatientConversation: (patientId: number) => Promise<void>;
  openPatientConversationWithDraft: (patientId: number, draft: string) => Promise<void>;
  sendOperationalToPatient: (
    patientId: number,
    text: string,
    label: string,
    brainMeta?: { type?: ClinicMessageType; appointmentId?: number | null },
  ) => Promise<void>;
  /** minutes until the patient's turn per queue projection; null when unknown. */
  etaMinutesFor: (appointmentId: number | null | undefined) => number | null;
  /** Brain v2 — enriched projection (confidence / risk). */
  enrichedProjectionById: Map<number, AppointmentProjection>;
  /** Brain v2 — SLA rule hits (delay / escalate / no-show candidate). */
  slaSuggestions: SlaSuggestion[];
  /** Brain v2 — unified operational suggestions for Decision UI. */
  suggestions: BrainSuggestion[];
  /** Primary row for the decision strip: first brain suggestion, or queue fallback when brain is empty. */
  primaryOperationalSuggestion: BrainSuggestion | null;
  /** Next suggestions after the primary (brain only; empty when using fallback primary). */
  secondaryOperationalSuggestions: BrainSuggestion[];
  /** Fingerprint for resetting «تجاهل القرار» when the primary target changes (brain or fallback). */
  operationalPrimaryFingerprint: string;
  /** Session-backed UX mode for the brain decision strip (suggestive | guided | strict). */
  operationalMode: OperationalMode;
  setOperationalMode: (m: OperationalMode) => void;
  decisionDismissed: boolean;
  dismissPrimaryDecision: () => void;
  resetPrimaryDecision: () => void;
  /** True in strict mode when a primary suggestion is visible and not dismissed (for future UI lock). */
  decisionGateActive: boolean;
  executeSuggestion: (s: BrainSuggestion) => Promise<void>;
  /** تنفيذ انتقال آلة التشغيل (يمر عبر الحراس ثم patch/رسائل). */
  transitionOperational: (
    transition: OperationalTransition,
    appointmentId?: number | null,
    opts?: { brainPolicy?: { requiresConfirmation: boolean; autoExecutable: boolean } },
  ) => Promise<void>;
  scrollToAppointment: (appointmentId: number) => void;
  pulseAppointmentCard: (appointmentId: number) => void;
  /** Aggregated queue pressure (delay sum, late count, level). */
  queueLoadSnapshot: LoadSnapshot;
  /** strict + يوجد توصية نشطة: قفل تشغيلي صارم على الطابور واللوحات حتى التنفيذ أو التجاهل. */
  hardOperationalLock: boolean;
  /** guided + توصية نشطة: إخفاء الإجراءات الثانوية (قائمة المزيد) لتقليل الإرهاق. */
  guidedOperationalLimit: boolean;
  /** إجبار إعادة حساب الإسقاط و SLA فورًا بعد تنفيذ ذي تأثير. */
  bumpAfterOperationalAction: () => void;
  /** سطر قصير يُظهر عند تغيّر «هوية» التوصية الظاهرة (يثبّت الثقة). */
  operationalPrimaryChangeHint: string | null;
  /**
   * جلسة تشغيل نشطة (نموذج حالة خفيف فوق الموعد) — تُحدَّث بانتقالات التشغيل لا بكل tick للـBrain.
   */
  activeOperationalSession: ActiveOperationalSession | null;
  /** يشتق من `activeOperationalSession` — للتوافق مع الشيفرة التي تعتمد على معرف فقط. */
  activeOperationalSessionAppointmentId: number | null;
  setActiveOperationalSession: Dispatch<SetStateAction<ActiveOperationalSession | null>>;
  /** يبني أو يمسح الجلسة من معرف الموعد فقط (نفس سلوك الـ setter السابق). */
  setActiveOperationalSessionAppointmentId: (appointmentId: number | null) => void;
  /** اقتراح انتقال عند بقاء الجلسة عالقة (مثلاً CALLED طويلاً). */
  operationalSessionTimeoutHint: { transition: "NO_SHOW"; appointmentId: number; reason: "session_timeout" } | null;
};

export type { ActiveOperationalSession, OperationalSessionPhase } from "@/lib/clinic-operational-session";

/** Re-export Brain v2 types for UI modules. */
export type { AppointmentProjection, BrainSuggestion, OperationalMode, SlaSuggestion } from "@/lib/clinic-brain/v2";

export type { LoadSnapshot } from "@/lib/clinic-brain/selection";

/** Derive Message Guard type from the Arabic label used across call sites. */
function labelToMessageType(label: string): ClinicMessageType | null {
  switch (label) {
    case "التذكير":
      return "reminder";
    case "تنبيه التأخير":
      return "delay";
    case "التقييم":
      return "rating";
    case "متابعة الغياب":
      return "no_show_followup";
    default:
      return null;
  }
}

/** يمنع قفز التوصية الظاهرة مع كل إعادة حساب للـ Brain (ثقة أوضح للمستخدم). */
const OPERATIONAL_DECISION_STICKY_MS = 8_000;

function operationalPrimaryIdentity(s: BrainSuggestion | null | undefined): string {
  if (!s) return "none";
  return `${s.action}:${s.appointment_id ?? ""}`;
}

export function useClinicDayOperations({
  rows,
  doctors,
  clinicTimezone,
  clinicWorkingHours,
  doctorFilter = "all",
  patients,
  shouldRefreshGuard,
  autoFocusActive = true,
}: ClinicDayOperationsOptions): ClinicDayOperationsResult {
  const router = useRouter();
  const apptElByIdRef = useRef<Map<number, HTMLElement>>(new Map());
  const patientConversationCacheRef = useRef<Map<number, number | null>>(new Map());
  const pendingApptActionsRef = useRef<Set<number>>(new Set());
  /** بعد التحديث الافتراضي، قد يصل `rows` من الخادم دون `checked_in` لجزء من الثانية — يمنع وميض البطاقة. */
  const staleArrivalCoalesceRef = useRef<Map<number, number>>(new Map());
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);

  const [nowTick, setNowTick] = useState(0);
  const [learningVersion, setLearningVersion] = useState(0);
  const [busyAppointmentIds, setBusyAppointmentIds] = useState<number[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>(rows);
  const [doctorHours, setDoctorHours] = useState<DayHoursRow[] | null>(null);
  const [activeOperationalSession, setActiveOperationalSession] = useState<ActiveOperationalSession | null>(null);
  const appointmentsRef = useRef(appointments);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  const pushApptBusy = useCallback((id: number) => {
    pendingApptActionsRef.current.add(id);
    setBusyAppointmentIds((s) => (s.includes(id) ? s : [...s, id]));
  }, []);

  const popApptBusy = useCallback((id: number) => {
    pendingApptActionsRef.current.delete(id);
    setBusyAppointmentIds((s) => s.filter((x) => x !== id));
  }, []);

  const isApptBusy = useCallback((id: number) => busyAppointmentIds.includes(id), [busyAppointmentIds]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const captureGridScroll = useCallback(() => {
    const el = gridScrollRef.current;
    if (el) {
      pendingScrollTopRef.current = el.scrollTop;
      try {
        sessionStorage.setItem("clinic-os:board:lastScrollTop", String(el.scrollTop));
      } catch {
        /* ignore */
      }
    }
  }, []);

  useLayoutEffect(() => {
    if (pendingScrollTopRef.current != null) return;
    try {
      const raw = sessionStorage.getItem("clinic-os:board:lastScrollTop");
      if (!raw) return;
      const y = Number(raw);
      if (!Number.isFinite(y)) return;
      const el = gridScrollRef.current;
      if (el) el.scrollTop = y;
    } catch {
      /* ignore */
    }
  }, []);

  const softRefresh = useCallback(() => {
    captureGridScroll();
    router.refresh();
  }, [captureGridScroll, router]);

  usePeriodicRefresh({
    intervalMs: 20_000,
    enabled: true,
    beforeRefresh: captureGridScroll,
    shouldRefresh: () => {
      if (shouldRefreshGuard) return shouldRefreshGuard();
      return true;
    },
  });

  useEffect(() => {
    setAppointments((prev) => {
      const pending = pendingApptActionsRef.current;
      const prevMap = new Map(prev.map((a) => [a.id, a]));
      const coalesce = staleArrivalCoalesceRef.current;
      const nowMs = Date.now();
      return rows.map((s) => {
        if (pending.has(s.id)) return prevMap.get(s.id) ?? s;
        const p = prevMap.get(s.id);
        const until = coalesce.get(s.id);
        if (until != null && nowMs >= until) coalesce.delete(s.id);
        const serverArrival = String(s.patient_arrival_state || "").toLowerCase();
        if (
          until != null &&
          nowMs < until &&
          p &&
          String(p.patient_arrival_state || "").toLowerCase() === "checked_in" &&
          serverArrival !== "checked_in"
        ) {
          return { ...s, patient_arrival_state: "checked_in" };
        }
        if (serverArrival === "checked_in" && until != null) coalesce.delete(s.id);
        return s;
      });
    });
  }, [rows]);

  useLayoutEffect(() => {
    const y = pendingScrollTopRef.current;
    if (y == null) return;
    const el = gridScrollRef.current;
    if (el) el.scrollTop = y;
    pendingScrollTopRef.current = null;
  }, [rows]);

  useEffect(() => {
    setLastSyncAt(Date.now());
  }, [rows]);

  const patchAppointmentOptimistic = useCallback(
    async (
      appointmentId: number,
      patch: AppointmentPatch,
      actionLabel: string,
      opts?: { afterSuccess?: () => void | Promise<void>; source?: string },
    ): Promise<void> => {
      assertPatchSourceAllowed(opts?.source);
      const lockKey = `appointment:${appointmentId}`;
      const outcome = await tryWithEntityLock(lockKey, async (): Promise<boolean> => {
        let prevSnapshot: AppointmentRow[] = [];
        setAppointments((curr) => {
          prevSnapshot = [...curr];
          return curr.map((a) => (a.id === appointmentId ? { ...a, ...patch } : a));
        });
        pushApptBusy(appointmentId);
        try {
          const res = await fetchWithRetry(
            `/api/ops/appointments/${appointmentId}/patch`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ...patch, idempotency_key: crypto.randomUUID() }),
            },
            { timeoutMs: OPERATIONAL_FETCH_TIMEOUT_MS },
          );
          const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          if (!res.ok || !json?.ok) {
            throw new Error(json?.error || res.statusText);
          }
          const rowBeforePatch = prevSnapshot.find((a) => a.id === appointmentId) ?? null;
          if (patch.patient_arrival_state === "checked_in") {
            rememberCheckInAtBrowser(appointmentId);
            staleArrivalCoalesceRef.current.set(appointmentId, Date.now() + 6000);
            const base = rowBeforePatch ?? prevSnapshot.find((a) => a.id === appointmentId) ?? null;
            const merged = base != null ? ({ ...base, ...patch } as AppointmentRow) : null;
            const snapNow = nowInClinicTZ(clinicTimezone);
            const created = createActiveOperationalSession(appointmentId, merged, snapNow, clinicTimezone);
            setActiveOperationalSession(created);
          }
          if (patch.status === "completed") {
            const t0 = takeCheckInTimestampMs(appointmentId);
            if (t0 != null && rowBeforePatch) {
              const mins = Math.round((Date.now() - t0) / 60_000);
              recordCompletedVisitMinutes(rowBeforePatch.doctor_id, mins);
              setLearningVersion((v) => v + 1);
            }
          }
          {
            const pst = String(patch.status ?? "").toLowerCase();
            if (pst === "completed" || pst === "cancelled" || pst === "no_show") {
              setActiveOperationalSession((prev) => (prev?.appointmentId === appointmentId ? null : prev));
            }
          }
          if (patch.patient_arrival_state === "checked_in") toast.success("تم تسجيل الحضور.");
          else if (patch.patient_arrival_state === "late") toast.success("تم تسجيل التأخر.");
          else if (patch.status === "no_show") toast.success("تم تسجيل الغياب.");
          await opts?.afterSuccess?.();
          if (patch.status === "completed") toast.success("تم إنهاء الكشف.");
          logOperationalAction({ kind: "appointment_patch", appointmentId, actionLabel, patch });
          softRefresh();
          return true;
        } catch (e) {
          setAppointments(prevSnapshot);
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(localizeApiError(msg), { description: `فشل تنفيذ: ${actionLabel}` });
          return false;
        } finally {
          popApptBusy(appointmentId);
        }
      });

      if (!outcome.ok) toast.message("يوجد إجراء قيد التنفيذ لهذا الموعد.");
    },
    [pushApptBusy, popApptBusy, softRefresh],
  );

  const conversationIdForPatient = useCallback(async (patientId: number): Promise<number | null> => {
    if (patientConversationCacheRef.current.has(patientId)) {
      return patientConversationCacheRef.current.get(patientId) ?? null;
    }
    const res = await fetchWithRetry(`/api/ops/patients/${patientId}`, { cache: "no-store" }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { ok?: boolean; patient?: { last_conversation_id?: number | null } };
    const cid = json?.ok ? Number(json.patient?.last_conversation_id || 0) || null : null;
    patientConversationCacheRef.current.set(patientId, cid);
    return cid;
  }, []);

  const openPatientConversation = useCallback(
    async (patientId: number) => {
      try {
        const cid = await conversationIdForPatient(patientId);
        if (cid) {
          router.push(`/inbox/${cid}`);
          return;
        }
        toast.error(
          "لا توجد محادثة لهذا المريض في صندوق العيادة. المحادثات تُدار عبر النظام فقط — لا يُفتح واتساب ويب من هنا حتى لا تختلط مع حساب شخصي أو رقم آخر. تأكد من تشغيل جسر واتساب الخاص بالعيادة ووصول الرسائل إلى الصندوق.",
        );
      } catch {
        toast.error("تعذر فتح المحادثة.");
      }
    },
    [conversationIdForPatient, router],
  );

  const openPatientConversationWithDraft = useCallback(
    async (patientId: number, draft: string) => {
      try {
        const cid = await conversationIdForPatient(patientId);
        if (cid) {
          router.push(`/inbox/${cid}?draft=${encodeURIComponent(draft)}`);
          return;
        }
        await copyText(draft);
        toast.error(
          "لا توجد محادثة في الصندوق — تم نسخ النص. أرسله من صندوق المحادثات بعد ظهور خيط لهذا المريض (عبر جسر واتساب للعيادة). لا يُفتح واتساب ويب من التطبيق.",
        );
      } catch {
        toast.error("تعذر فتح المحادثة.");
      }
    },
    [conversationIdForPatient, router],
  );

  const sendOperationalToPatient = useCallback(
    async (
      patientId: number,
      text: string,
      label: string,
      brainMeta?: { type?: ClinicMessageType; appointmentId?: number | null },
    ) => {
      const type = brainMeta?.type ?? labelToMessageType(label);
      const appointmentId = brainMeta?.appointmentId ?? null;
      if (type) {
        const decision = canSendMessage(type, { patientId, appointmentId });
        if (!decision.allowed) {
          toast.message(guardDeniedMessage(decision, type));
          brainAppendLog({
            t: new Date().toISOString(),
            kind: "message_guard_rejected",
            patientId,
            appointmentId,
            type,
            reason: decision.reason,
          });
          return;
        }
      }
      try {
        const cid = await conversationIdForPatient(patientId);
        if (!cid) {
          await copyText(text);
          toast.error(
            `لا توجد محادثة لهذا المريض في الصندوق — تم نسخ نص «${label}». الإرسال يكون من الصندوق فقط بعد ربط الجسر؛ لا يُفتح واتساب ويب من التطبيق.`,
          );
          logOperationalAction({
            kind: "operational_send_no_inbox_copy",
            patientId,
            appointmentId,
            label,
            type,
          });
          return;
        }
        const idemKey = type
          ? brainIdempotencyKey(type, { patientId, appointmentId })
          : `ops-msg-${cid}-${crypto.randomUUID()}`;
        await sendConversationReply(cid, text, idemKey);
        toast.success(`تم إرسال ${label}.`);
        if (type) recordMessageSent(type, { patientId, appointmentId });
        logOperationalAction({ kind: "operational_send", patientId, conversationId: cid, label });
        brainAppendLog({
          t: new Date().toISOString(),
          kind: "operational_send",
          patientId,
          appointmentId,
          conversationId: cid,
          label,
          type,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "تعذر الإرسال";
        toast.error(localizeApiError(msg) || "تعذر الإرسال");
        await copyText(text);
      }
    },
    [conversationIdForPatient],
  );

  const filtered = useMemo(() => {
    if (doctorFilter === "all") return appointments;
    return appointments.filter((r) => r.doctor_name === doctorFilter);
  }, [appointments, doctorFilter]);

  const calendarDays = useMemo(() => {
    const base = nowInClinicTZ(clinicTimezone).startOf("day");
    return Array.from({ length: 5 }).map((_, idx) => base.plus({ days: idx }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicTimezone, nowTick]);

  const clinicHoursNormalized = useMemo(() => {
    const list = Array.isArray(clinicWorkingHours) ? (clinicWorkingHours as DayHoursRow[]) : [];
    const map = new Map<number, DayHoursRow>();
    for (const r of list) map.set(Number(r.weekday), r);
    return map;
  }, [clinicWorkingHours]);

  const effectiveHoursByWeekday = useMemo(() => {
    const map = new Map<number, DayHoursRow>();
    if (doctorHours && doctorHours.length) {
      for (const r of doctorHours) map.set(Number(r.weekday), r);
    } else {
      clinicHoursNormalized.forEach((v, k) => map.set(k, v));
    }
    return map;
  }, [doctorHours, clinicHoursNormalized]);

  const slotsForDay = useMemo(() => {
    return (day: DateTime): number[] => {
      const wd = clinicWeekdayDb0Sun(day);
      const cfg = effectiveHoursByWeekday.get(wd);
      if (!cfg || cfg.is_closed) return [];
      const startH = parseHour(cfg.opens_at ?? null) ?? 9;
      const endH = parseHour(cfg.closes_at ?? null) ?? 17;
      const out: number[] = [];
      for (let h = startH; h < endH; h += 1) out.push(h);
      return out;
    };
  }, [effectiveHoursByWeekday]);

  const nowZoned = useMemo(
    () => nowInClinicTZ(clinicTimezone),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clinicTimezone, nowTick],
  );
  const activeOperationalSessionAppointmentId = activeOperationalSession?.appointmentId ?? null;

  const adoptOperationalSessionByAppointmentId = useCallback(
    (appointmentId: number | null) => {
      if (appointmentId == null) {
        setActiveOperationalSession(null);
        return;
      }
      const row = appointmentsRef.current.find((a) => a.id === appointmentId) ?? null;
      const created = createActiveOperationalSession(appointmentId, row, nowZoned, clinicTimezone);
      setActiveOperationalSession(created);
    },
    [nowZoned, clinicTimezone],
  );

  useEffect(() => {
    setActiveOperationalSession((prev) => {
      if (prev == null) return prev;
      if (prev.phaseLockUntilMs != null && Date.now() < prev.phaseLockUntilMs) {
        return prev;
      }
      const row = appointments.find((a) => a.id === prev.appointmentId);
      if (!row) return null;
      const nextPhase = deriveOperationalSessionPhase(row, nowZoned, clinicTimezone);
      if (nextPhase == null) return null;
      if (nextPhase === prev.state) return prev;
      return { ...prev, state: nextPhase, phaseLockUntilMs: undefined };
    });
  }, [appointments, nowZoned, nowTick, clinicTimezone]);

  const operationalSessionTimeoutHint = useMemo(() => {
    const s = activeOperationalSession;
    const sug = getSessionTimeoutSuggestion(s, Date.now());
    if (!sug || !s) return null;
    return { transition: sug, appointmentId: s.appointmentId, reason: "session_timeout" as const };
  }, [activeOperationalSession, nowTick]);

  const lastTimeoutToastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const h = operationalSessionTimeoutHint;
    if (!h) {
      lastTimeoutToastKeyRef.current = null;
      return;
    }
    const key = `${h.appointmentId}-${h.transition}`;
    if (lastTimeoutToastKeyRef.current === key) return;
    lastTimeoutToastKeyRef.current = key;
    toast.message(
      "تنبيه تشغيلي: موعد في حالة «تم الاستدعاء» منذ أكثر من 10 د — راجع «لم يحضر» أو أكمل الجلسة.",
      { duration: 12_000 },
    );
  }, [operationalSessionTimeoutHint]);

  const nowHour = useMemo(() => nowZoned.hour, [nowZoned]);
  const todayKey = useMemo(() => nowZoned.toISODate(), [nowZoned]);

  const getDoctorSlotMinutes = useCallback(
    (doctorId: number | null) => {
      const d = doctors.find((x) => x.id === doctorId);
      const m = d?.slot_duration_minutes;
      if (typeof m === "number" && Number.isFinite(m) && m >= 5) return m;
      return DEFAULT_VISIT_MINUTES;
    },
    [doctors],
  );

  const projectionById = useMemo((): Map<number, ProjectedSlot> => {
    const dayKey = nowZoned.toISODate();
    if (!dayKey) return new Map();
    return projectQueueTimelineForDay({
      appointments,
      now: nowZoned,
      clinicTimezone,
      dayKey,
      graceMinutes: ARRIVAL_GRACE_MINUTES,
      getEffectiveMinutes: (a) => getEffectiveDurationForProjection(a, getDoctorSlotMinutes(a.doctor_id)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, nowZoned, clinicTimezone, getDoctorSlotMinutes, learningVersion, nowTick]);

  const dayList = useMemo(() => {
    return filtered
      .map((a) => ({ a, local: toClinicZoned(a.starts_at, clinicTimezone) }))
      .filter((x): x is { a: AppointmentRow; local: DateTime } => Boolean(x.local))
      .filter((x) => x.local.toISODate() === todayKey)
      .sort((x, y) => x.local.toMillis() - y.local.toMillis());
  }, [filtered, clinicTimezone, todayKey]);

  const queueEngine = useMemo(
    () =>
      buildDayQueueEngineState({
        items: dayList.map((x) => ({ appointment: x.a, localStart: x.local })),
        now: nowZoned,
        clinicTimezone,
        graceMinutes: ARRIVAL_GRACE_MINUTES,
        getSlotMinutes: getDoctorSlotMinutes,
      }),
    [dayList, nowZoned, clinicTimezone, getDoctorSlotMinutes],
  );

  const todayTimeline = useMemo(() => {
    return {
      list: dayList,
      active: queueEngine.nowAppointment,
      next: queueEngine.serveNext ?? queueEngine.calendarNext,
      serveNext: queueEngine.serveNext,
      calendarNext: queueEngine.calendarNext,
    };
  }, [dayList, queueEngine]);

  const todayOps = useMemo(() => {
    const g = groupEnrichedForOpsPanels(queueEngine.enriched);
    return {
      emergencies: g.emergencies.map(mapEnrichedToOpsRow),
      lateItems: g.lateItems.map(mapEnrichedToOpsRow),
      checkedInItems: g.checkedInItems.map(mapEnrichedToOpsRow),
      upcomingItems: g.upcomingItems.map(mapEnrichedToOpsRow),
    };
  }, [queueEngine]);

  const etaMinutesFor = useCallback(
    (appointmentId: number | null | undefined): number | null => {
      if (!appointmentId) return null;
      const p = projectionById.get(appointmentId);
      if (!p) return null;
      const mins = Math.round(p.projected_start.diff(nowZoned, "minutes").minutes);
      if (!Number.isFinite(mins)) return null;
      return mins > 0 ? mins : 0;
    },
    [projectionById, nowZoned],
  );

  const nextReminderMinutes = useMemo(() => {
    if (!todayTimeline.next) return null;
    const t = toClinicZoned(todayTimeline.next.starts_at, clinicTimezone);
    if (!t) return null;
    const mins = t.diff(nowZoned, "minutes").minutes;
    if (!Number.isFinite(mins) || mins < 0 || mins > ARRIVAL_REMIND_MINUTES) return null;
    return mins;
  }, [todayTimeline.next, nowZoned, clinicTimezone]);

  const enrichedProjectionById = useMemo((): Map<number, AppointmentProjection> => {
    if (!todayKey) return new Map();
    return enrichProjectionsForDay({
      raw: projectionById,
      appointments,
      clinicTimezone,
    });
  }, [projectionById, appointments, clinicTimezone, todayKey]);

  const slaSuggestions = useMemo((): SlaSuggestion[] => {
    if (!todayKey) return [];
    return evaluateSla({
      enriched: enrichedProjectionById,
      appointments,
      now: nowZoned,
      clinicTimezone,
      dayKey: todayKey,
    });
  }, [enrichedProjectionById, appointments, nowZoned, clinicTimezone, todayKey]);

  const queueLoadSnapshot = useMemo((): LoadSnapshot => {
    return loadLevel({
      lateCount: todayOps.lateItems.length,
      checkedInCount: todayOps.checkedInItems.length,
      projection: projectionById,
    });
  }, [todayOps.lateItems.length, todayOps.checkedInItems.length, projectionById]);

  const queueLoadSnapshotRef = useRef(queueLoadSnapshot);
  queueLoadSnapshotRef.current = queueLoadSnapshot;

  const bumpAfterOperationalAction = useCallback(() => {
    setNowTick((n) => n + 1);
  }, []);

  const suggestions = useMemo((): BrainSuggestion[] => {
    const next = pickNextToCall({
      serveNext: queueEngine.serveNext,
      calendarNext: queueEngine.calendarNext,
    });
    return buildBrainSuggestions({
      serveNext: next.serveNext,
      calendarNext: next.calendarNext,
      isServeCalendarConflict: next.isServeCalendarConflict,
      sla: slaSuggestions,
      loadLevel: queueLoadSnapshot.level,
      enrichedByAppointmentId: enrichedProjectionById,
    });
  }, [
    queueEngine.serveNext,
    queueEngine.calendarNext,
    queueLoadSnapshot.level,
    slaSuggestions,
    enrichedProjectionById,
  ]);

  const suggestionFingerprint = useMemo(
    () => suggestions.map((x) => `${x.action}:${x.appointment_id ?? ""}:${x.confidence}`).join("|"),
    [suggestions],
  );

  const fallbackPrimarySuggestion = useMemo((): BrainSuggestion | null => {
    if (suggestions.length > 0) return null;
    const cand = pickFallbackCallAppointment(todayOps, nowZoned, clinicTimezone);
    if (!cand) return null;
    const nextPick = pickNextToCall({
      serveNext: todayTimeline.serveNext,
      calendarNext: todayTimeline.calendarNext,
    });
    const fc = enrichedProjectionById.get(cand.id)?.confidence ?? null;
    return brainCallNextSuggestion({
      appointmentId: cand.id,
      patientDisplayName: cand.patient_display_name,
      reason: `لا توجد توصية تلقائية — ركّز على: ${cand.patient_display_name ?? "مريض"} (طابور اليوم).`,
      confidence: 70,
      forecast_confidence: fc,
      isServeCalendarConflict: nextPick.isServeCalendarConflict,
    });
  }, [
    suggestions.length,
    todayOps.emergencies,
    todayOps.lateItems,
    todayOps.upcomingItems,
    nowZoned,
    clinicTimezone,
    enrichedProjectionById,
    todayTimeline.serveNext,
    todayTimeline.calendarNext,
  ]);

  const rawOperationalPrimarySuggestion = useMemo(
    () => suggestions[0] ?? fallbackPrimarySuggestion,
    [suggestions, fallbackPrimarySuggestion],
  );

  const rawOperationalPrimaryId = useMemo(
    () => operationalPrimaryIdentity(rawOperationalPrimarySuggestion),
    [rawOperationalPrimarySuggestion],
  );

  const emergencyHeadAppointmentId = useMemo(
    () => todayOps.emergencies[0]?.a.id ?? null,
    [todayOps.emergencies],
  );

  const decisionExecuteDepthRef = useRef(0);
  const lastPrimaryAdoptedAtRef = useRef(0);
  const stableOperationalPrimaryRef = useRef<BrainSuggestion | null>(null);
  const [stableOperationalPrimary, setStableOperationalPrimary] = useState<BrainSuggestion | null>(null);
  const [postExecuteTick, setPostExecuteTick] = useState(0);
  const [operationalPrimaryChangeHint, setOperationalPrimaryChangeHint] = useState<string | null>(null);
  const lateCountSnapshotRef = useRef(0);
  const emergencyHeadSnapshotRef = useRef<number | null>(null);

  useEffect(() => {
    if (!operationalPrimaryChangeHint) return;
    const t = window.setTimeout(() => setOperationalPrimaryChangeHint(null), 12_000);
    return () => window.clearTimeout(t);
  }, [operationalPrimaryChangeHint]);

  useEffect(() => {
    if (decisionExecuteDepthRef.current > 0) return;

    const snapLate = lateCountSnapshotRef.current;
    const snapEm = emergencyHeadSnapshotRef.current;
    const lateN = todayOps.lateItems.length;
    const emH = emergencyHeadAppointmentId;

    const adopt = (next: BrainSuggestion | null, prev: BrainSuggestion | null, withHint: boolean) => {
      if (next == null) {
        setOperationalPrimaryChangeHint(null);
        stableOperationalPrimaryRef.current = null;
        setStableOperationalPrimary(null);
        lastPrimaryAdoptedAtRef.current = Date.now();
        lateCountSnapshotRef.current = lateN;
        emergencyHeadSnapshotRef.current = emH;
        return;
      }
      const prevId = operationalPrimaryIdentity(prev);
      const nextId = operationalPrimaryIdentity(next);
      if (withHint && prev != null && prevId !== nextId) {
        const parts: string[] = [];
        if (emH != null && emH !== snapEm) parts.push("تحديث مقدّمة الطوارئ");
        if (lateN > snapLate) parts.push(`المتأخرون +${lateN - snapLate}`);
        if (prev.action !== next.action) parts.push("تغيّر نوع الإجراء المقترح");
        if (parts.length === 0) parts.push("تحديث أولوية التشغيل");
        setOperationalPrimaryChangeHint(`تغيّر القرار: ${parts.join(" · ")}`);
      }
      lastPrimaryAdoptedAtRef.current = Date.now();
      stableOperationalPrimaryRef.current = next;
      setStableOperationalPrimary(next);
      lateCountSnapshotRef.current = lateN;
      emergencyHeadSnapshotRef.current = emH;
    };

    const raw = rawOperationalPrimarySuggestion;
    const rawId = rawOperationalPrimaryId;

    if (!raw) {
      adopt(null, stableOperationalPrimaryRef.current, false);
      return;
    }

    const rawApptId = raw.appointment_id ?? null;
    const cur = stableOperationalPrimaryRef.current;
    const curId = operationalPrimaryIdentity(cur);

    if (emergencyHeadAppointmentId != null && rawApptId === emergencyHeadAppointmentId) {
      adopt(raw, cur, true);
      return;
    }

    if (rawId === curId) {
      adopt(raw, cur, false);
      return;
    }

    const now = Date.now();
    if (!cur || now - lastPrimaryAdoptedAtRef.current >= OPERATIONAL_DECISION_STICKY_MS) {
      adopt(raw, cur, true);
      return;
    }

    const remain = OPERATIONAL_DECISION_STICKY_MS - (now - lastPrimaryAdoptedAtRef.current);
    const t = window.setTimeout(() => {
      if (decisionExecuteDepthRef.current > 0) return;
      adopt(raw, stableOperationalPrimaryRef.current, true);
    }, remain);
    return () => window.clearTimeout(t);
  }, [
    rawOperationalPrimarySuggestion,
    rawOperationalPrimaryId,
    postExecuteTick,
    emergencyHeadAppointmentId,
    suggestionFingerprint,
    todayOps.lateItems.length,
  ]);

  const primaryOperationalSuggestion = stableOperationalPrimary;

  const secondaryOperationalSuggestions = useMemo(
    () => (suggestions.length > 0 ? suggestions.slice(1, 4) : []),
    [suggestions],
  );

  const operationalPrimaryFingerprint = useMemo(() => {
    if (suggestions.length > 0) return suggestionFingerprint;
    return `fb:${fallbackPrimarySuggestion?.action ?? "none"}:${fallbackPrimarySuggestion?.appointment_id ?? ""}`;
  }, [suggestionFingerprint, suggestions.length, fallbackPrimarySuggestion]);

  const [decisionDismissed, setDecisionDismissed] = useState(false);

  useEffect(() => {
    setDecisionDismissed(false);
    setOperationalPrimaryChangeHint(null);
    lastPrimaryAdoptedAtRef.current = 0;
  }, [operationalPrimaryFingerprint]);

  const [operationalMode, setOperationalModeState] = useState<OperationalMode>("guided");

  useEffect(() => {
    try {
      const v = sessionStorage.getItem("clinic-os:operational-mode");
      if (v === "suggestive" || v === "guided" || v === "strict") setOperationalModeState(v);
    } catch {
      /* ignore */
    }
  }, []);

  const setOperationalMode = useCallback((m: OperationalMode) => {
    setOperationalModeState(m);
    try {
      sessionStorage.setItem("clinic-os:operational-mode", m);
    } catch {
      /* ignore */
    }
  }, []);

  const hardOperationalLock = useMemo(
    () => operationalMode === "strict" && primaryOperationalSuggestion != null && !decisionDismissed,
    [operationalMode, primaryOperationalSuggestion, decisionDismissed],
  );

  const guidedOperationalLimit = useMemo(
    () => operationalMode === "guided" && primaryOperationalSuggestion != null && !decisionDismissed,
    [operationalMode, primaryOperationalSuggestion, decisionDismissed],
  );

  const decisionGateActive = hardOperationalLock;

  const dismissPrimaryDecision = useCallback(() => {
    setOperationalPrimaryChangeHint(null);
    setDecisionDismissed(true);
  }, []);
  const resetPrimaryDecision = useCallback(() => {
    setOperationalPrimaryChangeHint(null);
    setDecisionDismissed(false);
  }, []);

  const scrollToAppointment = useCallback((appointmentId: number) => {
    apptElByIdRef.current.get(appointmentId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const pulseAppointmentCard = useCallback((appointmentId: number) => {
    requestAnimationFrame(() => {
      const el = apptElByIdRef.current.get(appointmentId);
      if (!el) return;
      el.classList.add("clinic-ops-appt-flash");
      window.setTimeout(() => {
        el.classList.remove("clinic-ops-appt-flash");
      }, 1400);
    });
  }, []);

  useEffect(() => {
    if (decisionDismissed) return;
    const id = primaryOperationalSuggestion?.appointment_id;
    if (id == null) return;
    const t = window.setTimeout(() => {
      scrollToAppointment(id);
      pulseAppointmentCard(id);
    }, 120);
    return () => window.clearTimeout(t);
  }, [
    operationalPrimaryFingerprint,
    decisionDismissed,
    primaryOperationalSuggestion?.appointment_id,
    scrollToAppointment,
    pulseAppointmentCard,
  ]);

  useEffect(() => {
    if (!autoFocusActive) return;
    const targetId =
      todayTimeline.active?.id ??
      todayTimeline.serveNext?.id ??
      todayOps.emergencies[0]?.a.id ??
      todayOps.lateItems[0]?.a.id ??
      null;
    if (!targetId) return;
    const el = apptElByIdRef.current.get(targetId) ?? null;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [autoFocusActive, todayTimeline.active?.id, todayTimeline.serveNext?.id, todayOps.emergencies, todayOps.lateItems]);

  const moveAppointment = useCallback(
    async (appointmentId: number, targetDate: Date, targetHour: number) => {
      const current = appointmentsRef.current.find((a) => a.id === appointmentId);
      if (!current) return;
      const outcome = await tryWithEntityLock(`appointment:${appointmentId}`, async (): Promise<boolean> => {
        const prev = [...appointmentsRef.current];
        const z = String(clinicTimezone || "UTC");
        const curStart = DateTime.fromISO(current.starts_at, { zone: "utc" }).setZone(z);
        const curEnd = DateTime.fromISO(current.ends_at, { zone: "utc" }).setZone(z);
        const durationMin = Math.max(15, Math.round(curEnd.diff(curStart, "minutes").minutes));
        const target = DateTime.fromJSDate(targetDate).setZone(z);
        const newStartLocal = target.set({ hour: targetHour, minute: 0, second: 0, millisecond: 0 });
        const newEndLocal = newStartLocal.plus({ minutes: durationMin });
        const newStart = newStartLocal.toUTC().toISO()!;
        const newEnd = newEndLocal.toUTC().toISO()!;
        const optimistic = prev.map((a) => (a.id === appointmentId ? { ...a, starts_at: newStart, ends_at: newEnd } : a));
        setAppointments(optimistic);
        pushApptBusy(appointmentId);
        try {
          const res = await fetchWithRetry(
            `/api/ops/appointments/${appointmentId}/reschedule`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                starts_at: newStart,
                ends_at: newEnd,
                idempotency_key: `reschedule-${appointmentId}-${newStart}`,
              }),
            },
            { timeoutMs: OPERATIONAL_FETCH_TIMEOUT_MS },
          );
          const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !out.ok) {
            setAppointments(prev);
            toast.error(localizeApiError(out.error) || "تعذر إعادة الجدولة.");
            return false;
          }
          toast.success("تمت إعادة جدولة الموعد.");
          logOperationalAction({ kind: "appointment_reschedule", appointmentId, newStart, newEnd });
          softRefresh();
          return true;
        } catch {
          setAppointments(prev);
          toast.error("تعذر الاتصال بالشبكة.");
          return false;
        } finally {
          popApptBusy(appointmentId);
        }
      });
      if (!outcome.ok) toast.message("يوجد إجراء قيد التنفيذ لهذا الموعد.");
    },
    [clinicTimezone, pushApptBusy, popApptBusy, softRefresh],
  );

  const cancelBooking = useCallback(
    async (appointmentId: number) => {
      const outcome = await tryWithEntityLock(`appointment:${appointmentId}`, async (): Promise<boolean> => {
        const prev = [...appointmentsRef.current];
        setAppointments((cur) => cur.filter((x) => x.id !== appointmentId));
        pushApptBusy(appointmentId);
        try {
          const res = await fetchWithRetry(
            `/api/ops/appointments/${appointmentId}/cancel`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                idempotency_key: `cancel-${appointmentId}-${Date.now()}`,
              }),
            },
            { timeoutMs: OPERATIONAL_FETCH_TIMEOUT_MS },
          );
          const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !out.ok) {
            setAppointments(prev);
            toast.error(localizeApiError(out.error) || "تعذر إلغاء الحجز.");
            return false;
          }
          toast.success("تم إلغاء الموعد.");
          logOperationalAction({ kind: "appointment_cancel", appointmentId });
          softRefresh();
          return true;
        } catch {
          setAppointments(prev);
          toast.error("تعذر الاتصال بالشبكة.");
          return false;
        } finally {
          popApptBusy(appointmentId);
        }
      });
      if (!outcome.ok) toast.message("يوجد إجراء قيد التنفيذ لهذا الموعد.");
    },
    [pushApptBusy, popApptBusy, softRefresh],
  );

  const transitionOperational = useCallback(
    async (
      transition: OperationalTransition,
      appointmentId: number | null | undefined,
      opts?: { brainPolicy?: { requiresConfirmation: boolean; autoExecutable: boolean } },
    ) => {
      const targetId =
        appointmentId != null && appointmentId !== undefined
          ? appointmentId
          : activeOperationalSession?.appointmentId ?? null;

      const rowForTarget = targetId != null ? appointmentsRef.current.find((a) => a.id === targetId) : undefined;
      const isEmergencyTarget = isEmergencyAppointmentRow(rowForTarget);
      const fromStateForLog = activeOperationalSession?.state ?? null;

      try {
        assertOperationalTransitionAllowed(activeOperationalSession, transition, {
          targetAppointmentId: targetId,
          isEmergencyTarget,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return;
      }

      if (transition === "CALL" && isEmergencyTarget && targetId != null && rowForTarget) {
        const created = createActiveOperationalSession(targetId, rowForTarget, nowZoned, clinicTimezone);
        if (created) setActiveOperationalSession(created);
      }

      decisionExecuteDepthRef.current += 1;
      try {
        const loadBefore = queueLoadSnapshotRef.current.totalDelayMinutes;
        const runClosedLoop = (showMetricFeedback: boolean) => {
          setDecisionDismissed(true);
          bumpAfterOperationalAction();
          if (!showMetricFeedback) return;
          window.setTimeout(() => {
            const after = queueLoadSnapshotRef.current.totalDelayMinutes;
            const delta = loadBefore - after;
            if (delta >= 2) {
              toast.message(`تحسّن تراكم التأخير ~${Math.round(delta)} دقيقة — راقب شريط الحالة.`);
            }
          }, 56);
        };

        const logTransitionEvent = (t: OperationalTransition, apptId: number | null, reason?: string) => {
          appendOperationalEvent({
            appointmentId: apptId,
            transition: t,
            fromState: fromStateForLog,
            toState: inferToStateAfterSuccessfulTransition(t, fromStateForLog),
            at: Date.now(),
            actor: "nurse",
            reason,
          });
        };

        const bp = opts?.brainPolicy;

        switch (transition) {
          case "CALL": {
            const id = targetId;
            if (id == null) return;
            const row = appointmentsRef.current.find((a) => a.id === id);
            if (!row) {
              toast.error("الموعد غير موجود");
              return;
            }
            const needCallConfirm = bp != null ? bp.requiresConfirmation && !bp.autoExecutable : true;
            if (needCallConfirm && !window.confirm("تسجيل حضور هذا المريض؟")) return;
            const st = toClinicZoned(row.starts_at, clinicTimezone);
            const en = toClinicZoned(row.ends_at, clinicTimezone);
            const isNow = st ? appointmentIsActiveNow(row, nowZoned, st, en) : false;
            const checkIn = canPerformAction("check_in", row, { isNow });
            if (checkIn.allowed) {
              await patchAppointmentOptimistic(
                id,
                { patient_arrival_state: "checked_in" },
                "استدعاء — CALL",
                { source: "transition" },
              );
              logTransitionEvent("CALL", id, isEmergencyTarget ? "emergency_override" : undefined);
              pulseAppointmentCard(id);
              runClosedLoop(true);
              toast.success(`تم الاستدعاء — ${row.patient_display_name ?? "المريض"} في الطابور.`);
              return;
            }
            if (checkIn.reason === "already_checked_in") {
              toast.message("المريض مسجّل حضورًا بالفعل — يمكن فتح المحادثة.");
              if (row.patient_id) await openPatientConversation(row.patient_id);
              pulseAppointmentCard(id);
              adoptOperationalSessionByAppointmentId(id);
              logTransitionEvent("CALL", id, isEmergencyTarget ? "emergency_override" : undefined);
              runClosedLoop(true);
              toast.success("تم — المريض مسجّل مسبقًا.");
              return;
            }
            toast.message(permissionMessage(checkIn.reason) || "تعذّر تسجيل الحضور من الحالة الحالية.");
            return;
          }
          case "DELAY": {
            const id = activeOperationalSession?.appointmentId ?? targetId;
            if (id == null) return;
            const row = appointmentsRef.current.find((a) => a.id === id);
            const pid = row?.patient_id;
            if (!pid) {
              toast.error("لا يوجد مريض مرتبط بالموعد");
              return;
            }
            const needDelayConfirm = bp == null || !bp.autoExecutable;
            if (needDelayConfirm && !window.confirm("إرسال تنبيه تأخير لهذا المريض؟")) return;
            const eta = etaMinutesFor(id);
            const text = delayAlertOperationalText({ etaMinutes: eta });
            await sendOperationalToPatient(pid, text, "تنبيه التأخير", { type: "delay", appointmentId: id });
            adoptOperationalSessionByAppointmentId(id);
            logTransitionEvent("DELAY", id);
            runClosedLoop(true);
            toast.success("تم إرسال تنبيه التأخير.");
            return;
          }
          case "NO_SHOW": {
            const id = activeOperationalSession?.appointmentId ?? targetId;
            if (id == null) return;
            const row = appointmentsRef.current.find((a) => a.id === id);
            if (!row) {
              toast.error("الموعد غير موجود");
              return;
            }
            const st = toClinicZoned(row.starts_at, clinicTimezone);
            const en = toClinicZoned(row.ends_at, clinicTimezone);
            const isNow = st ? appointmentIsActiveNow(row, nowZoned, st, en) : false;
            const perm = canPerformAction("no_show", row, { isNow });
            if (!perm.allowed) {
              toast.message(permissionMessage(perm.reason));
              return;
            }
            if (!window.confirm("تأكيد تسجيل عدم الحضور؟")) return;
            await patchAppointmentOptimistic(
              id,
              { status: "no_show", patient_arrival_state: "no_show" },
              "لم يحضر — NO_SHOW",
              {
                source: "transition",
                afterSuccess: async () => {
                  const pid = row.patient_id;
                  if (!pid) return;
                  await sendOperationalToPatient(pid, noShowFollowupText(), "متابعة الغياب", {
                    type: "no_show_followup",
                    appointmentId: id,
                  });
                },
              },
            );
            logTransitionEvent("NO_SHOW", id);
            runClosedLoop(true);
            return;
          }
          case "COMPLETE": {
            const id = activeOperationalSession?.appointmentId;
            if (id == null) return;
            const row = appointmentsRef.current.find((a) => a.id === id);
            if (!row) {
              toast.error("الموعد غير موجود");
              return;
            }
            const st = toClinicZoned(row.starts_at, clinicTimezone);
            const en = toClinicZoned(row.ends_at, clinicTimezone);
            const isNow = st ? appointmentIsActiveNow(row, nowZoned, st, en) : false;
            const perm = canPerformAction("finish", row, { isNow });
            if (!perm.allowed) {
              toast.message(permissionMessage(perm.reason));
              return;
            }
            if (!window.confirm("إنهاء الكشف وتسجيل الإكمال؟")) return;
            await patchAppointmentOptimistic(id, { status: "completed" }, "إنهاء الكشف — COMPLETE", {
              source: "transition",
            });
            logTransitionEvent("COMPLETE", id);
            runClosedLoop(true);
            toast.success("تم إنهاء الكشف.");
            return;
          }
          case "START": {
            const startApptId = activeOperationalSession?.appointmentId ?? null;
            setActiveOperationalSession((prev) =>
              prev
                ? {
                    ...prev,
                    state: "IN_PROGRESS",
                    phaseLockUntilMs: Date.now() + 5 * 60_000,
                  }
                : null,
            );
            logTransitionEvent("START", startApptId);
            runClosedLoop(false);
            toast.message("تم تسجيل بدء الكشف تشغيليًا.");
            return;
          }
          case "CANCEL": {
            const id = activeOperationalSession?.appointmentId ?? targetId;
            if (id == null) return;
            const row = appointmentsRef.current.find((a) => a.id === id);
            if (!row) return;
            const st = toClinicZoned(row.starts_at, clinicTimezone);
            const en = toClinicZoned(row.ends_at, clinicTimezone);
            const isNow = st ? appointmentIsActiveNow(row, nowZoned, st, en) : false;
            const perm = canPerformAction("cancel", row, { isNow });
            if (!perm.allowed) {
              toast.message(permissionMessage(perm.reason));
              return;
            }
            if (!window.confirm("إلغاء هذا الحجز؟")) return;
            await cancelBooking(id);
            logTransitionEvent("CANCEL", id);
            runClosedLoop(false);
            return;
          }
          default:
            return;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(localizeApiError(msg) || "لم يتم التنفيذ — أعد المحاولة أو راجع الشبكة.");
      } finally {
        decisionExecuteDepthRef.current -= 1;
        setPostExecuteTick((x) => x + 1);
      }
    },
    [
      activeOperationalSession,
      clinicTimezone,
      nowZoned,
      setActiveOperationalSession,
      patchAppointmentOptimistic,
      sendOperationalToPatient,
      etaMinutesFor,
      openPatientConversation,
      bumpAfterOperationalAction,
      pulseAppointmentCard,
      adoptOperationalSessionByAppointmentId,
      cancelBooking,
    ],
  );

  const executeSuggestion = useCallback(
    async (s: BrainSuggestion) => {
      if (s.operationalTransition != null) {
        await transitionOperational(s.operationalTransition, s.appointment_id ?? null, {
          brainPolicy: { requiresConfirmation: s.requiresConfirmation, autoExecutable: s.autoExecutable },
        });
        return;
      }

      decisionExecuteDepthRef.current += 1;
      try {
        const loadBefore = queueLoadSnapshotRef.current.totalDelayMinutes;

        const scrollTo = (id: number | null | undefined) => {
          if (id == null) return;
          requestAnimationFrame(() => {
            apptElByIdRef.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
        };

        const closedLoop = (showMetricFeedback: boolean) => {
          setDecisionDismissed(true);
          bumpAfterOperationalAction();
          if (!showMetricFeedback) return;
          window.setTimeout(() => {
            const after = queueLoadSnapshotRef.current.totalDelayMinutes;
            const delta = loadBefore - after;
            if (delta >= 2) {
              toast.message(`تحسّن تراكم التأخير ~${Math.round(delta)} دقيقة — راقب شريط الحالة.`);
            }
          }, 56);
        };

        switch (s.action) {
          case "reschedule": {
            const id = s.appointment_id;
            if (id == null) return;
            if (!window.confirm("التمرير إلى بطاقة الموعد لإعادة الجدولة أو التصعيد؟")) return;
            adoptOperationalSessionByAppointmentId(id);
            scrollTo(id);
            pulseAppointmentCard(id);
            toast.message("راجع بطاقة الموعد في الطابور لإعادة الجدولة.");
            closedLoop(false);
            return;
          }
          case "review_conflict": {
            const id = s.appointment_id;
            if (id != null) adoptOperationalSessionByAppointmentId(id);
            scrollTo(id);
            if (id != null) pulseAppointmentCard(id);
            toast.message("تم التمرير إلى الموعد في الطابور.");
            closedLoop(false);
            return;
          }
          case "escalate_load": {
            toast.message("ضغط عالٍ على الطابور — راقب التأخير وأولوية الاستدعاء.");
            closedLoop(false);
            return;
          }
          default:
            return;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(localizeApiError(msg) || "لم يتم التنفيذ — أعد المحاولة أو راجع الشبكة.");
      } finally {
        decisionExecuteDepthRef.current -= 1;
        setPostExecuteTick((x) => x + 1);
      }
    },
    [
      transitionOperational,
      bumpAfterOperationalAction,
      pulseAppointmentCard,
      adoptOperationalSessionByAppointmentId,
    ],
  );

  const createAppointment = useCallback(
    async (args: {
      doctor_id: number;
      patient_id: number;
      starts_at: string;
      conversation_id?: number;
      idempotency_key?: string;
    }): Promise<{ ok: boolean; error?: string; appointment_id?: number }> => {
      try {
        const res = await fetchWithRetry(
          "/api/ops/appointments/create",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              doctor_id: args.doctor_id,
              patient_id: args.patient_id,
              starts_at: args.starts_at,
              conversation_id: args.conversation_id,
              idempotency_key: args.idempotency_key ?? `web-${Date.now()}`,
            }),
          },
          { timeoutMs: OPERATIONAL_FETCH_TIMEOUT_MS },
        );
        const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; appointment_id?: number };
        if (!res.ok || !out.ok) {
          return { ok: false, error: out.error || res.statusText };
        }
        softRefresh();
        return { ok: true, appointment_id: typeof out.appointment_id === "number" ? out.appointment_id : undefined };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "network_error" };
      }
    },
    [softRefresh],
  );

  return {
    appointments,
    setAppointments,
    appointmentsRef,
    lastSyncAt,
    learningVersion,
    nowTick,
    busyAppointmentIds,
    isApptBusy,
    apptElByIdRef,
    gridScrollRef,
    pushApptBusy,
    popApptBusy,
    nowZoned,
    nowHour,
    todayKey,
    calendarDays,
    slotsForDay,
    effectiveHoursByWeekday,
    clinicHoursNormalized,
    doctorHours,
    setDoctorHours,
    dayList,
    queueEngine,
    projectionById,
    todayTimeline,
    todayOps,
    nextReminderMinutes,
    getDoctorSlotMinutes,
    softRefresh,
    captureGridScroll,
    patchAppointmentOptimistic,
    moveAppointment,
    cancelBooking,
    createAppointment,
    conversationIdForPatient,
    openPatientConversation,
    openPatientConversationWithDraft,
    sendOperationalToPatient,
    etaMinutesFor,
    enrichedProjectionById,
    slaSuggestions,
    suggestions,
    primaryOperationalSuggestion,
    secondaryOperationalSuggestions,
    operationalPrimaryFingerprint,
    operationalMode,
    setOperationalMode,
    decisionDismissed,
    dismissPrimaryDecision,
    resetPrimaryDecision,
    decisionGateActive,
    executeSuggestion,
    transitionOperational,
    scrollToAppointment,
    pulseAppointmentCard,
    queueLoadSnapshot,
    hardOperationalLock,
    guidedOperationalLimit,
    bumpAfterOperationalAction,
    operationalPrimaryChangeHint,
    activeOperationalSession,
    activeOperationalSessionAppointmentId,
    setActiveOperationalSession,
    setActiveOperationalSessionAppointmentId: adoptOperationalSessionByAppointmentId,
    operationalSessionTimeoutHint,
  };
}
