import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Stethoscope,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

export const primaryNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "لوحة القيادة", icon: LayoutDashboard, description: "مركز تشغيل الممرضة والطابور اللحظي" },
  { href: "/doctor", label: "طابور الطبيب", icon: ClipboardList, description: "مواعيد اليوم والمحادثات العاجلة" },
  { href: "/inbox", label: "صندوق المحادثات", icon: MessageCircle, description: "محادثات واتساب وملف العملاء" },
  { href: "/appointments", label: "المواعيد", icon: CalendarDays, description: "إدارة الجدول وقوائم الانتظار" },
  { href: "/patients", label: "المرضى", icon: UsersRound, description: "إدارة المرضى ومؤشرات المخاطر" },
  { href: "/doctors", label: "الأطباء", icon: Stethoscope, description: "إشغال الأطباء والأداء" },
  { href: "/analytics", label: "التحليلات", icon: BarChart3, description: "تحليلات الإيراد والنمو" },
  { href: "/ai-center", label: "مركز الذكاء", icon: Bot, description: "جودة النموذج والتحكم بالأتمتة" },
  { href: "/billing", label: "الفوترة", icon: CreditCard, description: "الخطة والاستخدام والفواتير" },
  { href: "/settings", label: "الإعدادات", icon: Settings, description: "إعدادات العيادة والفريق والربط" },
];
