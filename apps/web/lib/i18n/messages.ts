type Dictionary = Record<string, string>;

const messages: Dictionary = {
  unknown: "حدث خطأ غير متوقع.",
  loading: "جار التحميل...",
  network_error: "تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا.",
  invalid_json: "تنسيق البيانات غير صالح.",
  invalid_id: "المعرف غير صالح.",
  required_text: "النص مطلوب.",
  save_success: "تم الحفظ بنجاح.",
  action_failed: "تعذر تنفيذ الإجراء.",
};

export function t(key: keyof typeof messages | string): string {
  return messages[key] ?? messages.unknown;
}
