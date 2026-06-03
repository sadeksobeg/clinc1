import type { Metadata } from "next";
import { brandTitle } from "@/lib/brand";
import { PlatformTopNav } from "@/components/layout/PlatformTopNav";

export const metadata: Metadata = {
  title: brandTitle("إدارة المنصة"),
  description: "لوحة تشغيل منصة نسق — العيادات، الإيرادات، الحوادث، والقرارات.",
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-cg-4 animate-fade-in">
      <PlatformTopNav />
      {children}
    </div>
  );
}
