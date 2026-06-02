import Link from "next/link";
import type { Metadata } from "next";
import {
  BarChart3,
  CalendarCheck2,
  Clock3,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
} from "lucide-react";
import { brand, brandTitle } from "@/lib/brand";
import { LandingHero } from "@/features/marketing/landing-hero";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: brandTitle("موظف استقبال ذكي لعيادتك"),
  description: brand.taglineAr,
};

const features = [
  {
    title: "واتساب موحد",
    desc: "صندوق محادثات واحد لكل فريق العيادة مع تتبع الحالة والأولوية.",
    icon: MessageCircleMore,
  },
  {
    title: "ذكاء اصطناعي محلي",
    desc: "ردود ذكية وسياقية مع إمكانية التدخل البشري في أي لحظة.",
    icon: Sparkles,
  },
  {
    title: "تقويم حجوزات",
    desc: "جدولة متعددة الأطباء مع توفر فوري وتذكيرات تلقائية.",
    icon: CalendarCheck2,
  },
  {
    title: "ملفات مرضى",
    desc: "سجل موحد لكل مريض مع تاريخ المواعيد والمحادثات.",
    icon: UsersRound,
  },
  {
    title: "تقارير أداء",
    desc: "مؤشرات تحويل وحجز ووقت موفّر — قرارات مبنية على أرقام.",
    icon: BarChart3,
  },
  {
    title: "صلاحيات فريق",
    desc: "أدوار واضحة للطبيب والممرضة والإدارة مع أمان متعدد المستويات.",
    icon: ShieldCheck,
  },
];

const steps = [
  { n: "01", title: "اربط رقم واتساب", desc: "ربط سريع مع إعداد موجّه خطوة بخطوة." },
  { n: "02", title: "أضف الأطباء والخدمات", desc: "تقويم ومواعيد لكل تخصص في دقائق." },
  { n: "03", title: "ابدأ استقبال المرضى", desc: "الذكاء الاصطناعي يرد ويحجز — أنت تراقب وتتحكم." },
];

const testimonials = [
  {
    quote: "قلّ وقت الرد على المرضى من ساعات إلى ثوانٍ. الحجوزات ارتفعت دون توظيف سكرتيرة إضافية.",
    role: "مدير عيادة أسنان",
    stars: 5,
  },
  {
    quote: "الجدولة أصبحت سلسة — المريض يختار الموعد من واتساب والنظام يؤكد تلقائياً.",
    role: "طبيب عام",
    stars: 5,
  },
  {
    quote: "الضغط على الاستقبال انخفض بشكل ملحوظ. الفريق يركز على الحالات التي تحتاج تدخلاً بشرياً.",
    role: "موظفة استقبال",
    stars: 5,
  },
];

const faqs = [
  {
    q: "هل أحتاج بطاقة دفع للتجربة؟",
    a: "لا، يمكنك بدء التجربة لمدة 3 أيام بدون بطاقة دفع ثم اختيار الاستمرار.",
  },
  { q: "هل النظام مناسب لأكثر من طبيب؟", a: "نعم، تبدأ بطبيب واحد ويمكنك إضافة أطباء إضافيين بسهولة." },
  { q: "هل يدعم النظام اللغة العربية بالكامل؟", a: "نعم، الواجهة وتجربة الاستخدام مصممة بالعربية الكاملة وباتجاه يمين إلى يسار." },
];

const trustLabels = ["عيادات أسنان", "مراكز تجميل", "عيادات جلدية", "مستوصفات", "مجمعات طبية"];

export default function HomePage() {
  return (
    <div className="space-y-24 pb-16 md:space-y-32">
      <LandingHero />

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="mb-6 text-center text-sm font-medium text-muted-foreground">موثوق من فرق طبية في المنطقة</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {trustLabels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-border/60 bg-card/60 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur-sm transition hover:border-primary/30 hover:text-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-primary">لماذا نسق؟</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            من <span className="text-muted-foreground line-through decoration-danger/40">فوضى واتساب</span> إلى تشغيل
            منظم
          </h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="section-glow relative overflow-hidden border-danger/20 bg-danger/5 p-8">
            <h3 className="mb-5 flex items-center gap-2 text-xl font-bold">
              <Clock3 className="h-5 w-5 text-danger" />
              مشاكل اليوم
            </h3>
            <ul className="space-y-3 text-muted-foreground">
              {["تأخر الرد — المريض يذهب للمنافس", "مواعيد ضائعة بين الرسائل", "سكرتيرة مرهقة 12 ساعة", "لا بيانات — لا تعرف ماذا يعمل"].map(
                (t) => (
                  <li key={t} className="flex gap-2">
                    <span className="text-danger">✕</span>
                    {t}
                  </li>
                ),
              )}
            </ul>
          </Card>
          <Card className="section-glow relative overflow-hidden border-primary/25 bg-primary/5 p-8">
            <h3 className="mb-5 flex items-center gap-2 text-xl font-bold">
              <Sparkles className="h-5 w-5 text-primary" />
              الحل مع {brand.nameAr}
            </h3>
            <ul className="space-y-3 text-muted-foreground">
              {["رد فوري 24/7 على واتساب", "حجز وتأكيد تلقائي", "تذكيرات ذكية قبل الموعد", "لوحة تحكم وتقارير لحظية"].map(
                (t) => (
                  <li key={t} className="flex gap-2">
                    <span className="text-primary">✓</span>
                    {t}
                  </li>
                ),
              )}
            </ul>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">مميزات مصممة لرفع التحويل</h2>
          <p className="mt-3 text-muted-foreground">كل ما تحتاجه العيادة الحديثة — في منصة واحدة متناسقة.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {features.map((item) => (
            <Card key={item.title} className="glass-card group p-6 hover-lift">
              <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3 text-primary transition group-hover:scale-105 group-hover:bg-primary/15">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">ابدأ في 3 خطوات</h2>
          <p className="mt-3 text-muted-foreground">من التسجيل إلى أول حجز — أقل من ساعة.</p>
        </div>
        <div className="relative grid gap-6 md:grid-cols-3">
          <div className="pointer-events-none absolute inset-x-0 top-12 hidden h-0.5 bg-gradient-to-l from-primary/0 via-primary/40 to-primary/0 md:block" aria-hidden />
          {steps.map((step) => (
            <Card key={step.n} className="glass-card relative p-6 text-center hover-lift">
              <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl nasaq-gradient text-lg font-bold text-white shadow-glow">
                {step.n}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <Card className="relative overflow-hidden p-10 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-0 nasaq-gradient opacity-[0.07]" aria-hidden />
          <p className="text-sm font-semibold text-primary">خطة العيادة</p>
          <p className="mt-3 text-5xl font-extrabold tracking-tight text-gradient">120$</p>
          <p className="text-lg text-muted-foreground">شهرياً · طبيب واحد</p>
          <p className="mt-1 text-sm text-muted-foreground">+30$ لكل طبيب إضافي · بدون رسوم خفية</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="brand" className="h-12 px-8">
              <Link href="/trial">ابدأ التجربة المجانية</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12">
              <Link href="/pricing">قارن الخطط</Link>
            </Button>
          </div>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">آراء من الميدان</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.role} className="glass-card flex flex-col p-6 hover-lift">
              <div className="mb-3 flex gap-0.5 text-warning">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">&ldquo;{t.quote}&rdquo;</p>
              <p className="mt-4 text-sm font-semibold">{t.role}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl space-y-4 px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">أسئلة شائعة</h2>
        {faqs.map((f) => (
          <details key={f.q} className="group glass-card rounded-2xl p-5 open:shadow-soft">
            <summary className="cursor-pointer list-none text-lg font-medium marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3">
                {f.q}
                <span className="text-primary transition group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-4 border-t border-border/60 pt-4 text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <Card className="relative overflow-hidden p-10 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.2),transparent_55%)]" aria-hidden />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
            جاهز لتحويل واتساب إلى{" "}
            <span className="text-gradient">موظف استقبال خارق</span>؟
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-muted-foreground">
            انضم لعيادات تختار {brand.nameAr} لتشغيل أذكى — ابدأ اليوم بدون بطاقة دفع.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="brand" className="h-12 px-8 shadow-glow">
              <Link href="/trial">ابدأ مجاناً — 3 أيام</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-8">
              <Link href="/demo">احجز عرضاً مباشراً</Link>
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
            name: brand.nameAr,
            applicationCategory: "تطبيق أعمال",
            operatingSystem: "ويب",
            offers: { "@type": "Offer", price: "120", priceCurrency: "USD" },
          }),
        }}
      />
    </div>
  );
}
