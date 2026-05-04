const apiErrors: Record<string, string> = {
  invalid_json: "تنسيق الطلب غير صالح.",
  bad_id: "المعرف المرسل غير صالح.",
  text_required: "الرسالة مطلوبة.",
  unknown_template_key: "القالب المطلوب غير موجود.",
  starts_ends_required: "وقت البداية والنهاية مطلوبان.",
  invalid_response: "استجابة الخدمة غير صالحة.",
  billing_snapshot_unavailable: "تعذر تحميل بيانات الفوترة الآن.",
  billing_payment_request_unavailable: "تعذر إرسال طلب الدفع الآن.",
  billing_double_confirm_required: "اعتماد الدفع يتطلب تأكيدًا مزدوجًا من الواجهة (انظر Runbook P7).",
  billing_idempotency_required: "اعتماد الدفع يتطلب مفتاح idempotency أطول (16+ حرفًا).",
  fetch_failed: "تعذر جلب البيانات.",
  network_error: "تعذر الاتصال بالخادم.",
  failed_to_send_reply: "تعذر إرسال الرد.",
  failed_to_load_billing: "تعذر تحميل بيانات الفوترة.",
  failed_to_submit_payment_request: "تعذر إرسال طلب الدفع.",
  failed_to_load_settings: "تعذر تحميل الإعدادات.",
  failed_to_save_settings: "تعذر حفظ الإعدادات.",
};

function normalizeKey(error: string): string {
  const key = error.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "_");
  return key.replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function localizeApiError(error?: string | null): string {
  if (!error) return "حدث خطأ غير متوقع.";
  const key = normalizeKey(error);
  return apiErrors[key] ?? "حدث خطأ غير متوقع.";
}
