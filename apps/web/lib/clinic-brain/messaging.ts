export type ClinicMessageType = "reminder" | "delay" | "rating" | "no_show_followup";

export type MessageGuardKeyArgs = {
  patientId: number;
  appointmentId?: number | null;
};

export type MessageGuardDecision = {
  allowed: boolean;
  cooldownLeftMs: number;
  lastSentAt: number | null;
  reason: "ok" | "already_sent_once" | "cooldown";
};

type StoreShape = Record<string, Record<string, number>>;

const STORAGE_KEY = "clinic-os:msg-guard:v1";

const ONCE_PER_APPOINTMENT: Set<ClinicMessageType> = new Set<ClinicMessageType>([
  "reminder",
  "rating",
  "no_show_followup",
]);

/** كل دقيقة ميلي ثانية. */
const COOLDOWNS_MS: Record<ClinicMessageType, number> = {
  reminder: 0,
  delay: 15 * 60 * 1000,
  rating: 0,
  no_show_followup: 0,
};

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
    /* quota */
  }
}

function keyFor(type: ClinicMessageType, args: MessageGuardKeyArgs): string {
  if (ONCE_PER_APPOINTMENT.has(type)) {
    return `${type}:${args.patientId}:${args.appointmentId ?? "na"}`;
  }
  return `${type}:${args.patientId}`;
}

export function canSendMessage(
  type: ClinicMessageType,
  args: MessageGuardKeyArgs,
  nowMs: number = Date.now(),
): MessageGuardDecision {
  const store = readStore();
  const bucket = store[type] ?? {};
  const k = keyFor(type, args);
  const last = bucket[k];

  if (last != null) {
    if (ONCE_PER_APPOINTMENT.has(type)) {
      return { allowed: false, cooldownLeftMs: 0, lastSentAt: last, reason: "already_sent_once" };
    }
    const cool = COOLDOWNS_MS[type];
    const elapsed = nowMs - last;
    if (elapsed < cool) {
      return { allowed: false, cooldownLeftMs: cool - elapsed, lastSentAt: last, reason: "cooldown" };
    }
  }
  return { allowed: true, cooldownLeftMs: 0, lastSentAt: last ?? null, reason: "ok" };
}

export function recordMessageSent(
  type: ClinicMessageType,
  args: MessageGuardKeyArgs,
  nowMs: number = Date.now(),
): void {
  const store = readStore();
  const bucket = { ...(store[type] ?? {}) };
  bucket[keyFor(type, args)] = nowMs;
  store[type] = bucket;
  writeStore(store);
}

export function clearMessageGuard(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function idempotencyKey(type: ClinicMessageType, args: MessageGuardKeyArgs): string {
  return `ops-${type}-v1-${args.patientId}-${args.appointmentId ?? "na"}`;
}

export function guardDeniedMessage(decision: MessageGuardDecision, type: ClinicMessageType): string {
  if (decision.reason === "already_sent_once") {
    return "أُرسلت هذه الرسالة مسبقًا لهذا الموعد.";
  }
  if (decision.reason === "cooldown") {
    const mins = Math.max(1, Math.round(decision.cooldownLeftMs / 60000));
    return `يرجى الانتظار ~${mins} دقيقة قبل إعادة إرسال ${labelFor(type)}.`;
  }
  return "";
}

function labelFor(type: ClinicMessageType): string {
  switch (type) {
    case "reminder":
      return "التذكير";
    case "delay":
      return "تنبيه التأخير";
    case "rating":
      return "طلب التقييم";
    case "no_show_followup":
      return "متابعة الغياب";
  }
}
