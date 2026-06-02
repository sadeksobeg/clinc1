import type { Metadata } from "next";
import { PublicShell } from "@/components/marketing/public-shell";
import { brand, brandTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: brandTitle("موظف استقبال ذكي للعيادات"),
  description: brand.taglineAr,
  openGraph: {
    title: brandTitle(),
    description: brand.description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: brand.nameAr,
    description: brand.taglineAr,
  },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
