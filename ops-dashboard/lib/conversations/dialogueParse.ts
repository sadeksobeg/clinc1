import type { StoredDialogueState } from "./dialogueTypes";
import { defaultDialogueState } from "./dialogueTypes";

/** Map Arabic-indic digits to Western. */
export function normalizeArabicIndicDigits(input: string): string {
  const map: Record<string, string> = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  };
  return input.replace(/[٠-٩]/g, (ch) => map[ch] ?? ch);
}

function normalizeArabicText(input: string): string {
  return normalizeArabicIndicDigits(input)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[ـ،؛]/g, " ")
    .trim();
}

const ORDINAL_AR: Array<{ n: number; forms: string[] }> = [
  { n: 1, forms: ["1", "اول", "الأول", "الاول", "١", "first"] },
  { n: 2, forms: ["2", "ثاني", "الثاني", "تاني", "٢", "second"] },
  { n: 3, forms: ["3", "ثالث", "الثالث", "تالت", "٣", "third"] },
  { n: 4, forms: ["4", "رابع", "الرابع", "٤", "fourth"] },
  { n: 5, forms: ["5", "خامس", "الخامس", "٥", "fifth"] },
  { n: 6, forms: ["6", "سادس", "السادس", "٦", "sixth"] },
  { n: 7, forms: ["7", "سابع", "السابع", "٧", "seventh"] },
  { n: 8, forms: ["8", "ثامن", "الثامن", "٨", "eighth"] },
  { n: 9, forms: ["9", "تاسع", "التاسع", "٩", "ninth"] },
];

/**
 * First list index 1..maxOptions from user text (Western or Arabic-indic).
 */
export function parseListSelection1Based(text: string, maxOptions: number): number | null {
  const t = normalizeArabicText(text);
  const m = t.match(/(?:^|\D)([1-9])(?:\D|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > maxOptions) return null;
  return n;
}

export function parseListSelectionWithOrdinals1Based(text: string, maxOptions: number): number | null {
  const numeric = parseListSelection1Based(text, maxOptions);
  if (numeric) return numeric;
  const t = normalizeArabicText(text);
  for (const { n, forms } of ORDINAL_AR) {
    if (n < 1 || n > maxOptions) continue;
    if (forms.some((f) => t.includes(f))) return n;
  }
  // "الخيار الثاني" style
  const m = t.match(/الخيار\s+([1-9])/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= maxOptions) return n;
  }
  return null;
}

export function parseTimeOfDayFromText(text: string): { hour: number; minute: number; hasMinute: boolean } | null {
  const t = normalizeArabicText(text);
  // Examples: "5", "5م", "5:30", "17:00", "5 مساء"
  const m = t.match(/(?:^|\D)(\d{1,2})(?:[:٫.](\d{2}))?(?:\D|$)/);
  if (!m) return null;
  let hour = Number(m[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  const minuteRaw = m[2];
  const minute = minuteRaw == null ? 0 : Number(minuteRaw);
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  const hasMinute = minuteRaw != null;

  const hasPm =
    t.includes("م") || t.includes("مساء") || t.includes("pm") || t.includes("بعد الظهر") || t.includes("عصر");
  const hasAm = t.includes("ص") || t.includes("صباح") || t.includes("am");
  if (hour <= 12 && (hasPm || hasAm)) {
    if (hasPm && hour < 12) hour += 12;
    if (hasAm && hour === 12) hour = 0;
  }
  return { hour, minute, hasMinute };
}

export function parseDialogueState(raw: unknown): StoredDialogueState {
  const d = defaultDialogueState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  const step = o.flow_step;
  const allowed = new Set([
    "idle",
    "awaiting_main_menu",
    "awaiting_specialty",
    "choose_clinic",
    "choose_doctor",
    "slot_offer",
    "awaiting_confirm",
    "awaiting_display_name",
    "done",
  ]);
  const tp = o.time_pref;
  const timePref =
    tp === "morning" || tp === "afternoon" || tp === "any"
      ? tp
      : tp === null
        ? null
        : undefined;

  const cf = o.collect_field;
  const collect_field = cf === "display_name" ? cf : null;
  const ra = o.resume_after_name;
  const resume_after_name = ra === "doctors" || ra === "specialty" ? ra : null;

  return {
    flow_step: typeof step === "string" && allowed.has(step) ? (step as StoredDialogueState["flow_step"]) : "idle",
    collect_field,
    resume_after_name,
    pending_kind: (o.pending_kind as StoredDialogueState["pending_kind"]) ?? null,
    pending_slots: Array.isArray(o.pending_slots) ? (o.pending_slots as StoredDialogueState["pending_slots"]) : undefined,
    pending_doctors: Array.isArray(o.pending_doctors)
      ? (o.pending_doctors as StoredDialogueState["pending_doctors"])
      : undefined,
    pending_clinics: Array.isArray(o.pending_clinics)
      ? (o.pending_clinics as StoredDialogueState["pending_clinics"])
      : undefined,
    pending_specialties: Array.isArray(o.pending_specialties)
      ? (o.pending_specialties as StoredDialogueState["pending_specialties"])
      : undefined,
    last_specialty: typeof o.last_specialty === "string" ? o.last_specialty : null,
    last_specialty_id:
      typeof o.last_specialty_id === "number" && Number.isFinite(o.last_specialty_id)
        ? Math.floor(o.last_specialty_id)
        : null,
    hub_clinic_id: typeof o.hub_clinic_id === "number" ? o.hub_clinic_id : undefined,
    consecutive_unparsed:
      typeof o.consecutive_unparsed === "number" && Number.isFinite(o.consecutive_unparsed)
        ? Math.max(0, Math.floor(o.consecutive_unparsed))
        : 0,
    time_pref: timePref === undefined ? undefined : timePref,
    slot_page:
      typeof o.slot_page === "number" && Number.isFinite(o.slot_page) ? Math.max(0, Math.floor(o.slot_page)) : undefined,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : undefined,
  };
}
