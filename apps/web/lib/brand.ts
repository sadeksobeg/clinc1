/**
 * Nasaq (نسق) — single source of truth for user-facing brand.
 */
export const brand = {
  nameAr: "نسق",
  nameEn: "Nasaq",
  taglineAr: "منصة تشغيل العيادات — واتساب ذكي، حجز، ومتابعة في تجربة واحدة",
  taglineEn: "Clinic operations platform — WhatsApp, scheduling, and care in one flow",
  description:
    "نسق (Nasaq) — منصة احترافية لتشغيل العيادات عبر واتساب الذكي، إدارة المواعيد، وصندوق المحادثات مع فريقك.",
  email: "info@tenegta.com",
  companyName: "Tenegta",
  companyUrl: "https://tenegta.com",
  siteUrl: "https://tenegta.tech",
  colors: {
    primary: "#0D9488",
    primaryDark: "#0F766E",
    accent: "#2563EB",
    gradientFrom: "#0D9488",
    gradientVia: "#0891B2",
    gradientTo: "#2563EB",
  },
} as const;

export function brandTitle(page?: string): string {
  return page ? `${page} · ${brand.nameAr}` : brand.nameAr;
}
