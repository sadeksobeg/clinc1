import type { Metadata } from "next";
import { brandTitle } from "@/lib/brand";
import { Card } from "@/components/ui/card";
import { DemoRequestForm } from "@/features/public/forms/demo-request-form";

export const metadata: Metadata = {
  title: brandTitle("طلب عرض"),
  description: "احجز عرضا سريعا وسيتواصل فريقنا خلال 24 ساعة.",
};

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12 sm:px-6 animate-fade-in">
      <h1 className="text-4xl font-bold text-gradient">طلب عرض مباشر</h1>
      <Card className="glass-card p-6 hover-lift">
        <p className="mb-4 text-muted-foreground">شاركنا بيانات العيادة واحتياجك لنصمم عرضا عمليا لفريقك.</p>
        <DemoRequestForm />
      </Card>
    </div>
  );
}
