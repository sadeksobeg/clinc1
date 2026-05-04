import { DateTime } from "luxon";

const DEFAULT_LOCALE = "ar-SA";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_TIMEZONE = "UTC";

export function formatCurrency(amount: number, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatArabicDate(value: string | Date, locale = DEFAULT_LOCALE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatArabicDateOnly(value: string | Date, locale = DEFAULT_LOCALE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatCompactNumber(value: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function safePercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function formatDayKey(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    weekday: "short",
    day: "2-digit",
  }).format(date);
}

export function toClinicZoned(dtIso: string, clinicTimezone: string): DateTime | null {
  const z = String(clinicTimezone || "").trim() || DEFAULT_TIMEZONE;
  const dt = DateTime.fromISO(String(dtIso || ""), { zone: "utc" });
  if (!dt.isValid) return null;
  return dt.setZone(z);
}

export function clinicWeekdayDb0Sun(dt: DateTime): number {
  // Luxon: 1=Mon..7=Sun → DB: 0=Sun..6=Sat
  return dt.weekday === 7 ? 0 : dt.weekday;
}

export function formatDayKeyInZone(dtIso: string, clinicTimezone: string, locale = DEFAULT_LOCALE): string {
  const dt = toClinicZoned(dtIso, clinicTimezone);
  if (!dt) return "—";
  return dt.setLocale(locale).toFormat("ccc dd");
}

export function isSameClinicDay(aIso: string, bIsoOrNow: string | Date, clinicTimezone: string): boolean {
  const z = String(clinicTimezone || "").trim() || DEFAULT_TIMEZONE;
  const a = DateTime.fromISO(String(aIso || ""), { zone: "utc" }).setZone(z);
  const b =
    typeof bIsoOrNow === "string"
      ? DateTime.fromISO(String(bIsoOrNow || ""), { zone: "utc" }).setZone(z)
      : DateTime.fromJSDate(bIsoOrNow).setZone(z);
  if (!a.isValid || !b.isValid) return false;
  return a.toISODate() === b.toISODate();
}

/**
 * Extract WhatsApp identity digits from chat_id (e.g. "20123456789@c.us" -> "20123456789").
 * Supports @c.us, @lid, @g.us and other suffixes.
 */
export function extractWhatsAppDigits(chatId: string | null | undefined): string | null {
  const raw = String(chatId || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("@lid")) {
    const head = raw.split("@")[0] ?? "";
    const digits = head.replace(/\D+/g, "");
    return digits || null;
  }
  if (raw.includes("@")) {
    const head = raw.split("@")[0] ?? "";
    const digits = head.replace(/\D+/g, "");
    return digits || null;
  }
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  return digits;
}

/** True when chat_id is a WhatsApp LID (ليس بالضرورة رقم هاتف قابل للاتصال). */
export function whatsappChatIdIsLid(chatId: string | null | undefined): boolean {
  return String(chatId || "").toLowerCase().includes("@lid");
}

const MIN_PHONE_DIGITS = 8;

/**
 * سطر عرض واحد للاتصال: يفضّل `phone_e164` من CRM، ثم معرف الدردشة.
 */
export function formatPatientContactLine(phoneE164: string | null | undefined, chatId: string | null | undefined): string {
  const pe = String(phoneE164 ?? "").trim();
  if (pe) {
    const d = pe.replace(/\D/g, "");
    if (d.length >= MIN_PHONE_DIGITS) return d;
  }
  const fromJid = extractWhatsAppDigits(chatId);
  return fromJid ?? "—";
}
