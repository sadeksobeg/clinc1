import { DateTime } from "luxon";
import { extractWhatsAppDigits } from "@/lib/format";
import type { PatientRow } from "@/lib/ops-server";

export function digitsOnly(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

/** Match loaded patients by phone digits (e164 or chat-derived). */
export function findPatientsByPhoneDigits(patients: PatientRow[], input: string): PatientRow[] {
  const want = digitsOnly(input);
  if (want.length < 8) return [];
  const out: PatientRow[] = [];
  for (const p of patients) {
    const pe = digitsOnly(p.phone_e164 ?? "");
    const chat = extractWhatsAppDigits(p.chat_id) ?? "";
    if (pe && (want.endsWith(pe.slice(-9)) || pe.endsWith(want.slice(-9)) || pe.includes(want) || want.includes(pe))) {
      out.push(p);
      continue;
    }
    if (chat && (want.endsWith(chat.slice(-9)) || chat.endsWith(want.slice(-9)))) {
      out.push(p);
    }
  }
  return out;
}

/** Next walk-in slot: ~15 min ahead, aligned to 5 minutes, in clinic TZ. */
export function defaultWalkInStartsAtIso(clinicTimezone: string): string {
  const z = String(clinicTimezone || "UTC");
  let t = DateTime.now().setZone(z).plus({ minutes: 15 });
  const m = t.minute;
  const rounded = Math.ceil(m / 5) * 5;
  t = t.set({ minute: rounded % 60, second: 0, millisecond: 0 });
  if (rounded >= 60) t = t.plus({ hours: 1 }).set({ minute: 0 });
  return t.toUTC().toISO()!;
}
