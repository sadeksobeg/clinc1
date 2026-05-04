const statusMap: Record<string, string> = {
  active: "نشط",
  open: "مفتوحة",
  closed: "مغلقة",
  pending: "معلق",
  approved: "مقبول",
  rejected: "مرفوض",
  cancelled: "ملغي",
  completed: "مكتمل",
  running: "قيد التشغيل",
  failed: "فشل",
  issued: "مصدرة",
  paid: "مدفوعة",
  draft: "مسودة",
  voided: "ملغاة",
  trial: "تجريبي",
  trial_expiring: "تجريبي - ينتهي قريبًا",
  trial_expired: "انتهت التجربة",
  past_due: "متأخر الدفع",
  grace: "فترة سماح",
  suspended: "موقوف",
  expired: "منتهي",
  unread: "غير مقروء",
  none: "بدون",
  unassigned: "غير مخصص",
  cash: "نقدي",
  shamcash: "شام كاش",
  manual_transfer: "تحويل يدوي",
};

export function statusLabel(value?: string | null): string {
  if (!value) return "غير محدد";
  return statusMap[value.toLowerCase()] ?? value;
}
