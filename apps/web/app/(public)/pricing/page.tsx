import type { Metadata } from "next";
import Link from "next/link";
import { brandTitle } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: brandTitle("الأسعار"),
  description: "خطة واضحة للعيادات: 120$ شهريا للطبيب الأول + 30$ لكل طبيب إضافي.",
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-bold">خطط واضحة ومرنة</h1>
      <Card className="glass-card p-8">
        <p className="text-sm text-muted-foreground">باقة العيادة المبدئية</p>
        <p className="mt-2 text-5xl font-extrabold">120$</p>
        <p className="text-muted-foreground">شهريا - طبيب واحد</p>
        <p className="mt-2 text-sm text-muted-foreground">+30$ لكل طبيب إضافي</p>
        <ul className="mt-6 space-y-2">
          <li>✔ طبيب واحد</li>
          <li>✔ واتساب ذكي</li>
          <li>✔ حجوزات</li>
          <li>✔ تقارير</li>
          <li>✔ دعم</li>
        </ul>
        <Button asChild className="mt-6">
          <Link href="/trial">ابدأ 3 أيام مجانا</Link>
        </Button>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold">مقارنة سريعة</h2>
          <p className="mt-3 text-muted-foreground">
            بالمقارنة مع الحلول التقليدية، تحصل على أتمتة واتساب، جدولة مركزية، وتقارير لحظية بدون تكلفة تشغيل فريق إضافي.
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="text-2xl font-semibold">حساب العائد المتوقع</h2>
          <p className="mt-3 text-muted-foreground">
            إذا زادت حجوزاتك 10 مواعيد فقط شهريا، غالبا تغطي تكلفة الاشتراك وتحقق هامش نمو واضح.
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">أسئلة الفوترة الشائعة</h2>
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer font-medium">هل يمكن الإلغاء في أي وقت؟</summary>
          <p className="pt-2 text-muted-foreground">نعم، يمكنك الإلغاء أو تعديل عدد الأطباء في أي وقت.</p>
        </details>
      </section>

      <Card className="p-8 text-center">
        <h3 className="text-2xl font-bold">جاهز للبدء؟</h3>
        <div className="mt-4 flex justify-center gap-3">
          <Button asChild>
            <Link href="/trial">ابدأ مجانا</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/demo">طلب عرض مباشر</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
