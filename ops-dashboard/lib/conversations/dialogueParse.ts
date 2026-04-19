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

/**
 * First list index 1..maxOptions from user text (Western or Arabic-indic).
 */
export function parseListSelection1Based(text: string, maxOptions: number): number | null {
  const t = normalizeArabicIndicDigits(text.trim());
  const m = t.match(/(?:^|\D)([1-9])(?:\D|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > maxOptions) return null;
  return n;
}

export function parseDialogueState(raw: unknown): StoredDialogueState {
  const d = defaultDialogueState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  const step = o.flow_step;
  const allowed = new Set([
    "idle",
    "choose_clinic",
    "choose_doctor",
    "slot_offer",
    "awaiting_confirm",
    "done",
  ]);
  const tp = o.time_pref;
  const timePref =
    tp === "morning" || tp === "afternoon" || tp === "any"
      ? tp
      : tp === null
        ? null
        : undefined;

  return {
    flow_step: typeof step === "string" && allowed.has(step) ? (step as StoredDialogueState["flow_step"]) : "idle",
    pending_kind: (o.pending_kind as StoredDialogueState["pending_kind"]) ?? null,
    pending_slots: Array.isArray(o.pending_slots) ? (o.pending_slots as StoredDialogueState["pending_slots"]) : undefined,
    pending_doctors: Array.isArray(o.pending_doctors)
      ? (o.pending_doctors as StoredDialogueState["pending_doctors"])
      : undefined,
    pending_clinics: Array.isArray(o.pending_clinics)
      ? (o.pending_clinics as StoredDialogueState["pending_clinics"])
      : undefined,
    last_specialty: typeof o.last_specialty === "string" ? o.last_specialty : null,
    hub_clinic_id: typeof o.hub_clinic_id === "number" ? o.hub_clinic_id : undefined,
    consecutive_unparsed:
      typeof o.consecutive_unparsed === "number" && Number.isFinite(o.consecutive_unparsed)
        ? Math.max(0, Math.floor(o.consecutive_unparsed))
        : 0,
    time_pref: timePref === undefined ? undefined : timePref,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : undefined,
  };
}
