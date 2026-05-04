import type { AppointmentRow } from "@/lib/ops-server";
import { estimateVisitMinutes } from "@/lib/scheduling-engine";

const STORAGE_KEY = "clinic-os:doctor-visit-minutes:v1";
const MAX_SAMPLES = 20;
const MIN_SAMPLES_FOR_LEAN = 2;

type StoreShape = Record<string, number[]>;

function readStore(): StoreShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoreShape;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(data: StoreShape): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

function keyForDoctor(doctorId: number | null): string {
  return String(doctorId ?? 0);
}

/**
 * يسجل مدة كشف فعلية (من تسجيل الدخول حتى الإنهاء) — متوسط متحرك محلي في المتصفح بدون API.
 */
export function recordCompletedVisitMinutes(doctorId: number | null, minutes: number): void {
  const m = Math.round(Number(minutes));
  if (!Number.isFinite(m) || m < 3 || m > 180) return;
  const k = keyForDoctor(doctorId);
  const store = readStore();
  const list = [...(store[k] ?? []), m].slice(-MAX_SAMPLES);
  store[k] = list;
  writeStore(store);
}

export function getLearnedAverageMinutes(doctorId: number | null): number | null {
  const k = keyForDoctor(doctorId);
  const list = readStore()[k];
  if (!list || list.length < MIN_SAMPLES_FOR_LEAN) return null;
  const sum = list.reduce((a, b) => a + b, 0);
  return Math.round(sum / list.length);
}

/** Number of stored duration samples for a doctor (max 20). Used for projection confidence. */
export function getLearnedSampleCount(doctorId: number | null): number {
  const k = keyForDoctor(doctorId);
  const list = readStore()[k];
  return list?.length ?? 0;
}

export function getEffectiveDurationForProjection(appointment: AppointmentRow, fallbackSlotMinutes: number): number {
  const learned = getLearnedAverageMinutes(appointment.doctor_id);
  const base = estimateVisitMinutes(appointment, fallbackSlotMinutes);
  if (learned == null) return base;
  return Math.round(0.5 * learned + 0.5 * base);
}

const CI_PREFIX = "co:ci:";

export function rememberCheckInAtBrowser(appointmentId: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${CI_PREFIX}${appointmentId}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function takeCheckInTimestampMs(appointmentId: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${CI_PREFIX}${appointmentId}`);
    sessionStorage.removeItem(`${CI_PREFIX}${appointmentId}`);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
