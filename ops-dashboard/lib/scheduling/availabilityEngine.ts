import { DateTime, Interval } from "luxon";

export type BusyInterval = { start: DateTime; end: DateTime };

/**
 * Build slot start times (wall clock in `zone`) between opens/closes TIME on `localDate`.
 */
export function iterateLocalSlots(
  zone: string,
  localDate: DateTime,
  opensAt: string,
  closesAt: string,
  slotMinutes: number,
): DateTime[] {
  const [oh, om] = opensAt.split(":").map((x) => parseInt(x, 10));
  const [ch, cm] = closesAt.split(":").map((x) => parseInt(x, 10));
  let t = localDate.set({ hour: oh, minute: om || 0, second: 0, millisecond: 0 });
  const end = localDate.set({ hour: ch, minute: cm || 0, second: 0, millisecond: 0 });
  const out: DateTime[] = [];
  while (true) {
    const next = t.plus({ minutes: slotMinutes });
    if (next > end) break;
    out.push(t);
    t = next;
  }
  return out;
}

export function intervalOverlapsBusy(slotStart: DateTime, slotEnd: DateTime, busy: BusyInterval[]): boolean {
  const slot = Interval.fromDateTimes(slotStart, slotEnd);
  for (const b of busy) {
    if (slot.overlaps(Interval.fromDateTimes(b.start, b.end))) return true;
  }
  return false;
}

export function pickFirstFreeSlots(
  zone: string,
  localDays: DateTime[],
  weekdayToHours: Map<number, { opens: string; closes: string }>,
  slotMinutes: number,
  busyUtc: BusyInterval[],
  maxSlots: number,
  nowUtc: DateTime = DateTime.utc(),
  minLeadMinutes = 2,
): { startUtc: DateTime; endUtc: DateTime }[] {
  const picked: { startUtc: DateTime; endUtc: DateTime }[] = [];
  const nowLocal = nowUtc.setZone(zone);
  const minStartLocal = nowLocal.plus({ minutes: minLeadMinutes });
  const busyInZone = busyUtc.map((b) => ({
    start: b.start.setZone(zone),
    end: b.end.setZone(zone),
  }));
  for (const day of localDays) {
    const wd = day.weekday % 7;
    const wh = weekdayToHours.get(wd);
    if (!wh) continue;
    const starts = iterateLocalSlots(zone, day, wh.opens, wh.closes, slotMinutes);
    for (const st of starts) {
      const en = st.plus({ minutes: slotMinutes });
      // Never offer a slot in the past (or too close) in local clinic time.
      if (st < minStartLocal) continue;
      if (intervalOverlapsBusy(st, en, busyInZone)) continue;
      picked.push({ startUtc: st.toUTC(), endUtc: en.toUTC() });
      if (picked.length >= maxSlots) return picked;
    }
  }
  return picked;
}
