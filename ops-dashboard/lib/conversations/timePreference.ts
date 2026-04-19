import { DateTime } from "luxon";
import type { SlotOffer } from "@/lib/scheduling/types";

export type TimePreference = "morning" | "afternoon" | "any" | null;

/** Heuristic from raw user text (booking intent message). */
export function detectTimePreference(text: string): TimePreference {
  const t = text.toLowerCase();
  const morning = [
    "بكير",
    "بكر",
    "صباح",
    "صبح",
    "morning",
    "early",
    "بدري",
    "اول النهار",
    "أول النهار",
    "فجر",
  ];
  const afternoon = [
    "بعد الضهر",
    "بعد الظهر",
    "ضهر",
    "ظهر",
    "عصر",
    "مسا",
    "مساء",
    "afternoon",
    "evening",
    "بليل",
    "ليل",
  ];
  const anyTime = ["اي وقت", "أي وقت", "اي موعد", "أي موعد", "شو ما كان", "ما يهم", "any time", "whenever"];

  if (anyTime.some((w) => t.includes(w))) return "any";
  if (morning.some((w) => t.includes(w))) return "morning";
  if (afternoon.some((w) => t.includes(w))) return "afternoon";
  return null;
}

function localHour(startsAtIso: string, tz: string): number | null {
  const dt = DateTime.fromISO(startsAtIso, { zone: "utc" }).setZone(tz);
  return dt.isValid ? dt.hour : null;
}

/** Keep slots whose local hour falls in window; preserve order. Morning = 6–12, afternoon = 12–18 (clinic-friendly defaults). */
export function filterSlotsByTimePreference(slots: SlotOffer[], tz: string, pref: TimePreference): SlotOffer[] {
  if (!pref || pref === "any" || slots.length === 0) return slots;
  return slots.filter((s) => {
    const h = localHour(s.starts_at, tz);
    if (h == null) return true;
    if (pref === "morning") return h >= 6 && h < 12;
    if (pref === "afternoon") return h >= 12 && h < 20;
    return true;
  });
}
