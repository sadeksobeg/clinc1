/**
 * Heuristic extraction of date/time/doctor hints from mixed Arabic/English text.
 */

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const EN_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function extractDoctor(text) {
  const t = String(text || "");
  const m = t.match(/(?:د\.|دكتور|doctor|dr\.?)\s*([^\n\r،,.]{2,40})/i);
  return m ? m[1].trim() : null;
}

function extractTime(text) {
  const t = String(text || "");
  const m24 = t.match(/\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/);
  if (m24) return `${m24[1]}:${m24[2]}`;
  const m12 = t.match(/\b(1[0-2]|0?\d)\s*[:.]\s*([0-5]\d)\s*(ص|م|am|pm)\b/i);
  if (m12) return `${m12[1]}:${m12[2]} ${m12[3]}`;
  return null;
}

function extractDate(text) {
  const t = String(text || "");
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = t.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (slash) return `${slash[1]}/${slash[2]}/${slash[3]}`;
  for (const d of [...AR_DAYS, ...EN_DAYS]) {
    if (t.toLowerCase().includes(d.toLowerCase())) return d;
  }
  return null;
}

function extractBookingHints(text) {
  return {
    date: extractDate(text),
    time: extractTime(text),
    doctor: extractDoctor(text),
  };
}

module.exports = { extractBookingHints };
