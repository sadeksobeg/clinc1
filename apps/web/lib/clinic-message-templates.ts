/** Central copy for operational WhatsApp-style messages (tone / length kept consistent). */

export const ARRIVAL_REMIND_MINUTES = 15;
export const ARRIVAL_GRACE_MINUTES = 10;

export function ratingRequestText(): string {
  return "شكرًا لزيارتكم. نرجو تقييم تجربتكم باختصار: ما الذي أعجبكم؟ وما الذي يمكن تحسينه؟";
}

export function noShowFollowupText(): string {
  return "لم نتمكن من حضوركم في الموعد اليوم. إذا ترغب بإعادة الحجز، أرسل الوقت المناسب وسنؤكد لك فورًا.";
}

export type OperationalTemplateArgs = {
  /** Projected minutes until patient's turn (ETA), from queue projection. */
  etaMinutes?: number | null;
};

function roundEtaToNearest5(mins: number): number {
  if (mins <= 5) return 5;
  return Math.max(5, Math.round(mins / 5) * 5);
}

export function reminderBeforeAppointmentText(args: OperationalTemplateArgs = {}): string {
  const eta = args.etaMinutes;
  if (typeof eta === "number" && Number.isFinite(eta) && eta > 0) {
    const rounded = roundEtaToNearest5(eta);
    return `تذكير: موعدك بعد ~${rounded} دقيقة. يرجى الحضور قبل ${ARRIVAL_REMIND_MINUTES} دقيقة لضمان بدء الكشف في وقته.`;
  }
  return `يرجى الحضور قبل ${ARRIVAL_REMIND_MINUTES} دقيقة من الموعد لضمان بدء الكشف في الوقت المحدد.`;
}

export function delayAlertOperationalText(args: OperationalTemplateArgs = {}): string {
  const eta = args.etaMinutes;
  if (typeof eta === "number" && Number.isFinite(eta) && eta > 0) {
    const rounded = roundEtaToNearest5(eta);
    return `نعتذر، الموعد المتوقع خلال ~${rounded} دقيقة بسبب ضغط العيادة. شكرًا لصبركم.`;
  }
  return "تنبيه: قد يتأخر موعدك قليلًا بسبب ضغط العيادة. نعتذر لك وسنخدمك بأسرع وقت ممكن.";
}
