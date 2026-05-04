import type { Pool } from "pg";
import { DateTime } from "luxon";
import { formatTime12hAr, weekdayNameAr, toArabicIndicDigits } from "@/lib/conversations/whatsappTime";

export type ClinicOpenStatus = {
  open: boolean;
  /** Arabic message when closed (for patient-facing replies). */
  closed_message_ar: string;
  /** Next local opening hint if derivable */
  next_hint_ar?: string;
};

/**
 * If the clinic has no rows in `clinic_public_hours`, we assume always open (legacy behaviour).
 */
export async function getClinicPublicOpenStatus(pool: Pool, clinicId: number): Promise<ClinicOpenStatus> {
  const c = await pool.query(`SELECT timezone, name FROM clinics WHERE id = $1 AND deleted_at IS NULL`, [clinicId]);
  const zone = (c.rows[0]?.timezone as string) || "Asia/Amman";
  const clinicName = (c.rows[0]?.name as string) || "العيادة";

  const wh = await pool.query(
    `SELECT weekday, is_closed, opens_at::text AS opens, closes_at::text AS closes
     FROM clinic_public_hours WHERE clinic_id = $1`,
    [clinicId],
  );

  if (wh.rows.length === 0) {
    return { open: true, closed_message_ar: "" };
  }

  const now = DateTime.now().setZone(zone);
  // Luxon: Monday=1..Sunday=7. DB: 0=Sunday..6=Saturday.
  const dbWeekday = now.weekday % 7;

  const row = wh.rows.find((r: { weekday: number }) => Number(r.weekday) === dbWeekday) as
    | { is_closed: boolean; opens: string | null; closes: string | null }
    | undefined;

  if (!row || row.is_closed) {
    const todayName = weekdayNameAr(dbWeekday);
    return {
      open: false,
      closed_message_ar: `عيادة «${clinicName}» مغلقة اليوم (${todayName}). يمكنك ترك رسالة وسنعاود التواصل في أقرب وقت عمل.`,
      next_hint_ar: nextOpenHintAr(wh.rows, zone, now),
    };
  }

  const opens = row.opens ? row.opens.slice(0, 8) : null;
  const closes = row.closes ? row.closes.slice(0, 8) : null;
  if (!opens || !closes) {
    return { open: true, closed_message_ar: "" };
  }

  const tOpen = DateTime.fromISO(`${now.toISODate()}T${opens}`, { zone });
  const tClose = DateTime.fromISO(`${now.toISODate()}T${closes}`, { zone });
  if (!tOpen.isValid || !tClose.isValid) {
    return { open: true, closed_message_ar: "" };
  }

  if (now < tOpen || now > tClose) {
    const todayName = weekdayNameAr(dbWeekday);
    const openLabel = tOpen.isValid ? formatTime12hAr(tOpen) : toArabicIndicDigits(opens.slice(0, 5));
    const closeLabel = tClose.isValid ? formatTime12hAr(tClose) : toArabicIndicDigits(closes.slice(0, 5));
    return {
      open: false,
      closed_message_ar: `عيادة «${clinicName}» خارج أوقات الاستقبال الآن. دوام اليوم (${todayName}): من ${openLabel} إلى ${closeLabel}. يمكنك طلب موعد لأوقات لاحقة.`,
      next_hint_ar: nextOpenHintAr(wh.rows, zone, now),
    };
  }

  return { open: true, closed_message_ar: "" };
}

function nextOpenHintAr(
  rows: Array<{ weekday: number; is_closed: boolean; opens: string | null; closes: string | null }>,
  zone: string,
  now: DateTime,
): string | undefined {
  // Find the next open day within 7 days (including tomorrow), return "أقرب دوام: <day> <opens>"
  for (let i = 1; i <= 7; i += 1) {
    const day = now.plus({ days: i });
    const wd = day.weekday % 7; // DB weekday
    const row = rows.find((r) => Number(r.weekday) === wd) as { is_closed: boolean; opens: string | null; closes: string | null } | undefined;
    if (!row || row.is_closed) continue;
    const opens = row.opens ? row.opens.slice(0, 8) : null;
    if (!opens) continue;
    const tOpen = DateTime.fromISO(`${day.toISODate()}T${opens}`, { zone });
    const openLabel = tOpen.isValid ? formatTime12hAr(tOpen) : toArabicIndicDigits(opens.slice(0, 5));
    return `أقرب دوام: ${weekdayNameAr(wd)} ${openLabel}.`;
  }
  return undefined;
}

export async function formatClinicTodayHoursAr(pool: Pool, clinicId: number): Promise<string> {
  const c = await pool.query(`SELECT timezone, name FROM clinics WHERE id = $1 AND deleted_at IS NULL`, [clinicId]);
  const zone = (c.rows[0]?.timezone as string) || "Asia/Amman";
  const wh = await pool.query(
    `SELECT weekday, is_closed, opens_at::text AS opens, closes_at::text AS closes
     FROM clinic_public_hours WHERE clinic_id = $1`,
    [clinicId],
  );
  if (!wh.rows.length) return "";
  const now = DateTime.now().setZone(zone);
  const wd = now.weekday % 7;
  const row = wh.rows.find((r: { weekday: number }) => Number(r.weekday) === wd) as
    | { is_closed: boolean; opens: string | null; closes: string | null }
    | undefined;
  const dayName = weekdayNameAr(wd);
  if (!row || row.is_closed) return `دوام اليوم (${dayName}): مغلق.`;
  const opens = row.opens ? row.opens.slice(0, 8) : null;
  const closes = row.closes ? row.closes.slice(0, 8) : null;
  if (!opens || !closes) return `دوام اليوم (${dayName}): غير محدد.`;
  const tOpen = DateTime.fromISO(`${now.toISODate()}T${opens}`, { zone });
  const tClose = DateTime.fromISO(`${now.toISODate()}T${closes}`, { zone });
  const openLabel = tOpen.isValid ? formatTime12hAr(tOpen) : toArabicIndicDigits(opens.slice(0, 5));
  const closeLabel = tClose.isValid ? formatTime12hAr(tClose) : toArabicIndicDigits(closes.slice(0, 5));
  return `دوام اليوم (${dayName}): من ${openLabel} إلى ${closeLabel}.`;
}
