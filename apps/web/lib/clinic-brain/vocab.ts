/** Single source of truth for operational phrasing. */

export type OperationalPhase =
  | "check_in"
  | "in_progress"
  | "completed"
  | "no_show"
  | "expected"
  | "late"
  | "cancelled";

export const OPERATIONAL_LABEL_AR: Record<OperationalPhase, string> = {
  check_in: "تسجيل الحضور",
  in_progress: "بدء الكشف",
  completed: "إنهاء الكشف",
  no_show: "لم يحضر",
  expected: "قيد الانتظار",
  late: "متأخر",
  cancelled: "ملغى",
};

export const ACTION_LABEL_AR = {
  check_in: "تسجيل الحضور",
  start: "بدء الكشف",
  finish: "إنهاء الكشف",
  mark_late: "تأخير",
  no_show: "لم يحضر",
  cancel: "إلغاء",
  reschedule: "إعادة جدولة",
  walk_in: "إضافة سريعة",
  message_reminder: "إرسال تذكير",
  message_delay: "إرسال تنبيه تأخير",
  message_rating: "إرسال طلب تقييم",
  open_whatsapp: "فتح المحادثة في الصندوق",
  open_conversation: "فتح المحادثة",
} as const;

export type ActionVocabKey = keyof typeof ACTION_LABEL_AR;

export function actionLabel(key: ActionVocabKey): string {
  return ACTION_LABEL_AR[key];
}
