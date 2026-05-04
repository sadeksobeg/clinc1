import type { Metadata } from "next";
import { PublicShell } from "@/components/marketing/public-shell";

export const metadata: Metadata = {
  title: "كلينك ساس - موظف استقبال ذكي للعيادات",
  description: "موظف استقبال ذكي لعيادتك يعمل 24/7 عبر واتساب: حجز تلقائي، متابعة مرضى، وتقارير أداء.",
  openGraph: {
    title: "كلينك ساس - موظف استقبال ذكي للعيادات",
    description: "ابدأ 3 أيام مجانية بدون بطاقة دفع.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "كلينك ساس",
    description: "حوّل واتساب إلى موظف استقبال خارق.",
  },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
