import { DateTime } from "luxon";

export type DayHours = { weekday: number; opens: string; closes: string };

/** Map DB weekday 0=Sun..6=Sat to Luxon weekday 1=Mon..7=Sun */
export function luxonWeekdayToDb(luxonWd: number): number {
  return luxonWd === 7 ? 0 : luxonWd;
}

export function isWithinWorkingHours(
  zone: string,
  nowUtc: DateTime,
  hoursRows: DayHours[],
): { open: boolean; todayLine?: string } {
  const local = nowUtc.setZone(zone);
  const dbWd = luxonWeekdayToDb(local.weekday);
  const row = hoursRows.find((h) => h.weekday === dbWd);
  if (!row) {
    return { open: false, todayLine: "اليوم عطلة في الجدول التجريبي." };
  }
  const [oh, om] = row.opens.split(":").map((x) => parseInt(x, 10));
  const [ch, cm] = row.closes.split(":").map((x) => parseInt(x, 10));
  const openT = local.set({ hour: oh, minute: om || 0, second: 0, millisecond: 0 });
  const closeT = local.set({ hour: ch, minute: cm || 0, second: 0, millisecond: 0 });
  const open = local >= openT && local < closeT;
  const line = `أوقات العمل اليوم: من ${row.opens.slice(0, 5)} إلى ${row.closes.slice(0, 5)} (${zone}).`;
  return { open, todayLine: line };
}
