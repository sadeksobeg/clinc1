import type { OperationalTransition } from "@/lib/clinic-operational-transitions";
import type { OperationalSessionPhase } from "@/lib/clinic-operational-session";
import { logOperationalAction } from "@/lib/operational-safety";

export type OperationalEventActor = "nurse" | "system";

export type OperationalEvent = {
  id: string;
  appointmentId: number | null;
  transition: OperationalTransition;
  fromState: OperationalSessionPhase | null;
  toState: OperationalSessionPhase | null;
  at: number;
  actor: OperationalEventActor;
  reason?: string;
};

const LS_KEY = "clinic_ops_events";

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** تقدير الحالة بعد نجاح الانتقال (للتدقيق — لا يُستخدم كمصدر حقيقة للجلسة). */
export function inferToStateAfterSuccessfulTransition(
  transition: OperationalTransition,
  fromState: OperationalSessionPhase | null,
): OperationalSessionPhase | null {
  switch (transition) {
    case "START":
      return "IN_PROGRESS";
    case "COMPLETE":
    case "NO_SHOW":
    case "CANCEL":
      return null;
    case "CALL":
      return "CALLED";
    case "DELAY":
      return fromState ?? "CALLED";
    default:
      return fromState;
  }
}

export function appendOperationalEvent(
  event: Omit<OperationalEvent, "id"> & { id?: string },
): void {
  const full: OperationalEvent = {
    id: event.id ?? generateEventId(),
    appointmentId: event.appointmentId,
    transition: event.transition,
    fromState: event.fromState,
    toState: event.toState,
    at: event.at,
    actor: event.actor,
    reason: event.reason,
  };
  logOperationalAction({ kind: "operational_event", ...full });
  try {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(LS_KEY);
    const store: OperationalEvent[] = raw ? (JSON.parse(raw) as OperationalEvent[]) : [];
    store.push(full);
    localStorage.setItem(LS_KEY, JSON.stringify(store.slice(-500)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readOperationalEventsFromLocal(): OperationalEvent[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OperationalEvent[];
  } catch {
    return [];
  }
}
