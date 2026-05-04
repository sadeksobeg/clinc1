import { Activity, AlertTriangle, Building2, ClipboardList, LifeBuoy, PlayCircle, Search, Settings, Shield, TrendingUp, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PlatformNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

export const platformNavigation: PlatformNavigationItem[] = [
  { href: "/platform", label: "لوحة التحكم", icon: Activity, description: "نظرة عامة وقيادة التشغيل" },
  { href: "/platform/clinics", label: "العيادات", icon: Building2, description: "إدارة العيادات (الدخول، الحالة، الحسابات)" },
  { href: "/platform/incidents", label: "الحوادث", icon: AlertTriangle, description: "إدارة الحوادث (إقرار/تعيين/حل)" },
  { href: "/platform/decisions", label: "القرارات", icon: ClipboardList, description: "قرارات التشغيل (موافقة/متابعة)" },
  { href: "/platform/actions", label: "الإجراءات", icon: PlayCircle, description: "أوامر التنفيذ + التحقق" },
  { href: "/platform/revenue", label: "الإيرادات", icon: TrendingUp, description: "MRR + التجديدات + الطلبات" },
  { href: "/platform/growth", label: "النمو", icon: TrendingUp, description: "التجارب والتحويل" },
  { href: "/platform/support", label: "الدعم", icon: LifeBuoy, description: "طابور الدعم العالمي" },
  { href: "/platform/search", label: "بحث", icon: Search, description: "بحث عبر جميع العيادات" },
  { href: "/platform/audit", label: "التدقيق", icon: Shield, description: "من فعل ماذا ومتى" },
  { href: "/ops-center", label: "مركز العمليات", icon: Wrench, description: "عمليات النظام والطوارئ" },
  { href: "/admin", label: "لوحة الإدارة", icon: Shield, description: "إدارة داخلية" },
  { href: "/platform/settings", label: "إعدادات المنصة", icon: Settings, description: "إعدادات التحكم والصلاحيات" },
];

