import { normalizeArabicIndicDigits } from "./dialogueParse";
import type { StoredDialogueState } from "./dialogueTypes";
import { welcomeMainMenu } from "./patientCopy";

const RESET_PHRASES = [
  "مرحبا",
  "مرحبًا",
  "السلام",
  "سلام",
  "السلام عليكم",
  "هلا",
  "اهلا",
  "أهلا",
  "أهلاً",
  "hello",
  "hi",
  "hey",
  "قائمة",
  "القائمة",
  "من جديد",
  "من البداية",
  "بداية",
  "الرئيسية",
  "الرئيسيه",
  "menu",
  "start",
  "restart",
  "الغاء",
  "إلغاء",
  "cancel",
];

/** Patient wants to restart — not a slot/doctor list pick. */
export function isSessionResetIntent(text: string): boolean {
  const t = normalizeArabicIndicDigits(String(text || ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (t === "0" || t === "00") return true;
  return RESET_PHRASES.some((p) => t === p || t.startsWith(`${p} `) || t.endsWith(` ${p}`));
}

const STALE_DIALOGUE_MS = 30 * 60 * 1000;

export function isDialogueStateStale(d: StoredDialogueState): boolean {
  const raw = d.updated_at;
  if (!raw) return false;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > STALE_DIALOGUE_MS;
}

/** Clears FSM pending lists so "1" cannot confirm an old slot. */
export function dialogueStateClearedMerge(): Record<string, unknown> {
  return {
    flow_step: "awaiting_main_menu",
    pending_kind: "main_menu",
    pending_slots: [],
    pending_doctors: [],
    pending_clinics: [],
    pending_specialties: [],
    collect_field: null,
    resume_after_name: null,
    consecutive_unparsed: 0,
    slot_page: 0,
    updated_at: new Date().toISOString(),
  };
}

export function buildMainMenuResetTurn(): {
  reply_text: string;
  finalIntent: string;
  finalPriority: number;
  decision_source: string;
  handoff_required: boolean;
  dialogueMerge: Record<string, unknown>;
} {
  return {
    reply_text: welcomeMainMenu(),
    finalIntent: "GENERAL",
    finalPriority: 4,
    decision_source: "main_menu_reset",
    handoff_required: false,
    dialogueMerge: dialogueStateClearedMerge(),
  };
}
