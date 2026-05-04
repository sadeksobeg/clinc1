import { DateTime } from "luxon";

const ARABIC_INDIC_MAP: Record<string, string> = {
  "0": "٠",
  "1": "١",
  "2": "٢",
  "3": "٣",
  "4": "٤",
  "5": "٥",
  "6": "٦",
  "7": "٧",
  "8": "٨",
  "9": "٩",
};

export function toArabicIndicDigits(input: string): string {
  return String(input).replace(/[0-9]/g, (d) => ARABIC_INDIC_MAP[d] ?? d);
}

export function weekdayNameAr(weekday0Sun: number): string {
  const names = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const ix = Number(weekday0Sun);
  return names[ix] || `اليوم ${ix}`;
}

/**
 * Arabic 12h time formatting (ص/م) with Arabic-indic digits.
 * Example: ٤:٣٠ م
 */
export function formatTime12hAr(dt: DateTime): string {
  const local = dt;
  const hour = local.hour;
  const isPm = hour >= 12;
  const hour12 = ((hour + 11) % 12) + 1;
  const mm = String(local.minute).padStart(2, "0");
  const suffix = isPm ? "م" : "ص";
  return toArabicIndicDigits(`${hour12}:${mm} ${suffix}`);
}

/**
 * Arabic date + time (12h) for WhatsApp.
 * Example: الثلاثاء ٢٨-٠٤-٢٠٢٦ ٤:٣٠ م
 */
export function formatDateTimeAr(dt: DateTime): string {
  const wd0 = (dt.weekday % 7); // luxon: 1=Mon..7=Sun => Sunday->0
  const weekday0Sun = wd0 === 0 ? 0 : wd0; // keep 0..6, Sunday 0
  const dayName = weekdayNameAr(weekday0Sun);
  const dd = String(dt.day).padStart(2, "0");
  const MM = String(dt.month).padStart(2, "0");
  const yyyy = String(dt.year);
  const date = toArabicIndicDigits(`${dd}-${MM}-${yyyy}`);
  return `${dayName} ${date} ${formatTime12hAr(dt)}`;
}

