import type { Metadata } from "next";
import Link from "next/link";
import { brand, brandTitle } from "@/lib/brand";
import { Card } from "@/components/ui/card";
import { ContactForm } from "@/features/public/forms/contact-form";

export const metadata: Metadata = {
  title: brandTitle("تواصل معنا"),
  description: "تواصل مع فريق نسق عبر البريد أو نموذج طلب اتصال.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-12 sm:px-6 animate-fade-in">
      <h1 className="text-4xl font-bold">تواصل معنا</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card p-6 hover-lift">
          <h2 className="text-2xl font-semibold">قنوات التواصل</h2>
          <p className="mt-3 text-muted-foreground">
            البريد الإلكتروني:{" "}
            <a href={`mailto:${brand.email}`} className="font-medium text-primary hover:underline">
              {brand.email}
            </a>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            منتج من{" "}
            <Link href={brand.companyUrl} className="font-medium text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              {brand.companyUrl.replace(/^https?:\/\//, "")}
            </Link>
          </p>
          <p className="mt-4 text-sm text-muted-foreground">FAQ سريع: الأسعار، التجربة، الربط، الدعم.</p>
        </Card>
        <Card className="glass-card p-6">
          <h2 className="mb-3 text-2xl font-semibold">أرسل رسالة</h2>
          <p className="mb-4 text-sm text-muted-foreground">تصل رسالتك مباشرة إلى {brand.email}</p>
          <ContactForm />
        </Card>
      </div>
    </div>
  );
}
