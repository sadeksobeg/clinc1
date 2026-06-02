import type { Metadata } from "next";
import { brandTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: brandTitle("إدارة المنصة"),
  description: "لوحة تشغيل منصة نسق — العيادات، الإيرادات، الحوادث، والقرارات.",
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
