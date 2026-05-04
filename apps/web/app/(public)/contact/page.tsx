import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { ContactForm } from "@/features/public/forms/contact-form";

export const metadata: Metadata = {
  title: "تواصل معنا | كلينك ساس",
  description: "تواصل معنا عبر واتساب أو البريد أو نموذج طلب اتصال.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-bold">تواصل معنا</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold">قنوات التواصل</h2>
          <p className="mt-3 text-muted-foreground">واتساب: +966 55 000 0000</p>
          <p className="text-muted-foreground">البريد الإلكتروني: hello@clinicsaas.app</p>
          <p className="mt-4 text-sm text-muted-foreground">FAQ سريع: الأسعار، التجربة، الربط، الدعم.</p>
        </Card>
        <Card className="p-6">
          <h2 className="mb-3 text-2xl font-semibold">طلب اتصال</h2>
          <ContactForm />
        </Card>
      </div>
    </div>
  );
}
