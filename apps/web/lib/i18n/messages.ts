export type Locale = "ar" | "en";

const ar = {
  "auth.login.title": "تسجيل الدخول",
  "nav.dashboard": "لوحة القيادة",
  "nav.inbox": "صندوق الوارد",
  "nav.appointments": "المواعيد",
  "billing.locked": "الاشتراك يتطلب تجديداً",
} as const;

const en: Record<keyof typeof ar, string> = {
  "auth.login.title": "Sign in",
  "nav.dashboard": "Dashboard",
  "nav.inbox": "Inbox",
  "nav.appointments": "Appointments",
  "billing.locked": "Subscription renewal required",
};

const catalogs = { ar, en } as const;

export function t(key: keyof typeof ar, locale: Locale = "ar"): string {
  return catalogs[locale][key] ?? catalogs.ar[key] ?? key;
}
