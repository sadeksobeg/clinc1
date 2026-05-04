import Link from "next/link";
import type { Metadata } from "next";
import { BarChart3, CalendarCheck2, MessageCircleMore, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "كلينك ساس | موظف استقبال ذكي لعيادتك",
  description:
    "رد تلقائي، تنظيم حجوزات، متابعة المرضى، تقليل الضغط على السكرتيرة، وزيادة الحجوزات عبر واتساب.",
};

const features = [
  { title: "واتساب موحد", icon: MessageCircleMore },
  { title: "ذكاء اصطناعي محلي", icon: Sparkles },
  { title: "تقويم حجوزات", icon: CalendarCheck2 },
  { title: "ملفات مرضى", icon: UsersRound },
  { title: "تقارير أداء", icon: BarChart3 },
  { title: "صلاحيات فريق", icon: ShieldCheck },
];

const faqs = [
  {
    q: "هل أحتاج بطاقة دفع للتجربة؟",
    a: "لا، يمكنك بدء التجربة لمدة 3 أيام بدون بطاقة دفع ثم اختيار الاستمرار.",
  },
  { q: "هل النظام مناسب لأكثر من طبيب؟", a: "نعم، تبدأ بطبيب واحد ويمكنك إضافة أطباء إضافيين بسهولة." },
  { q: "هل يدعم النظام اللغة العربية بالكامل؟", a: "نعم، الواجهة وتجربة الاستخدام مصممة بالعربية الكاملة وباتجاه يمين إلى يسار." },
];

export default function HomePage() {
  return (
    <div className="space-y-20 pb-10">
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.2),transparent_40%),radial-gradient(circle_at_80%_0%,hsl(var(--secondary)/0.18),transparent_35%)]" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <Badge variant="secondary" className="w-fit">
              منصة تشغيل عيادات بمعايير عالمية
            </Badge>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
              موظف استقبال ذكي لعيادتك يعمل 24/7 عبر واتساب
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              رد تلقائي، تنظيم حجوزات، متابعة المرضى، تقليل الضغط على السكرتيرة، وزيادة الحجوزات.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/trial">ابدأ 3 أيام مجانا</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/demo">شاهد العرض</Link>
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Card className="glass-card p-3 text-center">+32% حجوزات</Card>
              <Card className="glass-card p-3 text-center">24/7 رد تلقائي</Card>
              <Card className="glass-card p-3 text-center">90% أسرع</Card>
            </div>
          </div>
          <Card className="glass-card relative p-6">
            <div className="space-y-4">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-sm text-muted-foreground">صندوق واتساب المباشر</p>
                <p className="mt-2 text-sm">المريض: أحتاج أقرب موعد أسنان غدا</p>
                <p className="mt-2 rounded-lg bg-primary/10 p-2 text-sm">المساعد: تم، هذه أفضل 3 مواعيد متاحة.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background p-3 text-sm">مواعيد اليوم: 18</div>
                <div className="rounded-xl border bg-background p-3 text-sm">الردود التلقائية: 74%</div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-4 rounded-3xl border bg-card p-8 text-center sm:grid-cols-3">
          <p className="text-sm font-semibold text-muted-foreground">عيادات كبرى</p>
          <p className="text-sm font-semibold text-muted-foreground">مراكز طبية</p>
          <p className="text-sm font-semibold text-muted-foreground">شركاء</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6">
        <h2 className="text-3xl font-bold">من المشاكل اليومية إلى التشغيل الذكي</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h3 className="mb-4 text-xl font-bold">مشاكل اليوم</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>❌ تأخر الرد</li>
              <li>❌ ضياع المواعيد</li>
              <li>❌ ضغط السكرتارية</li>
              <li>❌ فقدان المرضى</li>
            </ul>
          </Card>
          <Card className="p-6">
            <h3 className="mb-4 text-xl font-bold">الحل معنا</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>✅ رد فوري</li>
              <li>✅ حجز تلقائي</li>
              <li>✅ تذكير بالمواعيد</li>
              <li>✅ تقارير ذكية</li>
            </ul>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6">
        <h2 className="text-3xl font-bold">مميزات مصممة لرفع التحويل</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((item) => (
            <Card key={item.title} className="group p-5 transition hover:-translate-y-1 hover:shadow-xl">
              <item.icon className="mb-4 h-6 w-6 text-primary" />
              <h3 className="text-lg font-semibold">{item.title}</h3>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6">
        <h2 className="text-3xl font-bold">كيف تبدأ في 3 خطوات</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {["1 اربط رقمك", "2 أضف الأطباء", "3 ابدأ استقبال المرضى"].map((s) => (
            <Card key={s} className="p-5 text-center text-lg font-semibold">
              {s}
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <Card className="glass-card p-8 text-center">
          <p className="text-sm text-muted-foreground">خطة العيادة المبدئية</p>
          <p className="mt-2 text-4xl font-extrabold">120$ / شهر</p>
          <p className="mt-2 text-muted-foreground">طبيب واحد +30$ لكل طبيب إضافي</p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/pricing">ابدأ الآن</Link>
          </Button>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
        <h2 className="text-3xl font-bold">آراء العملاء</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">"قللنا وقت الرد بشكل واضح." - مدير عيادة</Card>
          <Card className="p-5">"جدولة المواعيد أصبحت سلسة جدًا." - طبيب</Card>
          <Card className="p-5">"خف الضغط علينا في الاستقبال." - موظف استقبال</Card>
        </div>
      </section>

      <section className="mx-auto max-w-5xl space-y-3 px-4 sm:px-6">
        <h2 className="text-3xl font-bold">الأسئلة الشائعة</h2>
        {faqs.map((f) => (
          <details key={f.q} className="rounded-2xl border bg-card p-4">
            <summary className="cursor-pointer text-lg font-medium">{f.q}</summary>
            <p className="pt-3 text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <Card className="glass-card p-8 text-center">
          <h2 className="text-3xl font-bold">جاهز لتحويل واتساب إلى موظف استقبال خارق؟</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/trial">ابدأ مجانا</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/demo">احجز عرض</Link>
            </Button>
          </div>
        </Card>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
              name: "كلينك ساس",
              applicationCategory: "تطبيق أعمال",
              operatingSystem: "ويب",
            offers: { "@type": "Offer", price: "120", priceCurrency: "USD" },
          }),
        }}
      />
    </div>
  );
}
