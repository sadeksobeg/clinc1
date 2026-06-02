"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  MessageCircleMore,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const stats = [
  { label: "زيادة الحجوزات", value: "+32%", icon: TrendingUp },
  { label: "رد تلقائي", value: "24/7", icon: Zap },
  { label: "توفير وقت الفريق", value: "90%", icon: Sparkles },
];

const chatMessages: Array<{ from: "patient" | "ai"; text: string }> = [
  { from: "patient", text: "السلام عليكم، أحتاج أقرب موعد أسنان غداً 🦷" },
  { from: "ai", text: "وعليكم السلام! هذه أفضل 3 مواعيد متاحة لديك:" },
  { from: "ai", text: "① 10:30 ص  ② 2:00 م  ③ 5:30 م — اختر الرقم المناسب" },
];

export function LandingHero() {
  const reduceMotion = useReducedMotion();

  const fade = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay },
        };

  return (
    <section className="relative overflow-hidden">
      <div className="hero-mesh pointer-events-none absolute inset-0" aria-hidden />
      <div className="hero-orb hero-orb-a pointer-events-none absolute -start-24 top-10 h-72 w-72 rounded-full opacity-60" aria-hidden />
      <div className="hero-orb hero-orb-b pointer-events-none absolute -end-16 top-32 h-96 w-96 rounded-full opacity-50" aria-hidden />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <motion.div className="space-y-7" {...fade(0)}>
          <Badge variant="secondary" className="w-fit gap-1.5 border-gradient px-3 py-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {brand.nameAr} — تشغيل عيادات بمعايير عالمية
          </Badge>

          <h1 className="text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-[3.25rem]">
            <span className="text-gradient">موظف استقبال ذكي</span>
            <br />
            <span className="text-foreground">يعمل لعيادتك 24/7</span>
            <br />
            <span className="text-foreground/90">عبر واتساب</span>
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            حوّل رسائل المرضى إلى حجوزات مؤكدة — رد فوري، تقويم متعدد الأطباء، ومتابعة تلقائية بدون إرهاق
            فريق الاستقبال.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="brand" className="h-12 px-8 text-base shadow-glow">
              <Link href="/trial">
                ابدأ 3 أيام مجاناً
                <ArrowLeft className="me-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 border-border/80 bg-background/60 px-8">
              <Link href="/demo">شاهد العرض الحي</Link>
            </Button>
          </div>

          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {["بدون بطاقة دفع", "إعداد خلال دقائق", "دعم عربي كامل"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                {t}
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-3 gap-3 pt-2">
            {stats.map((item, i) => (
              <motion.div
                key={item.label}
                className="glass-card group rounded-2xl p-4 text-center hover-lift"
                {...(reduceMotion ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.35 + i * 0.08 } })}
              >
                <item.icon className="mx-auto mb-2 h-5 w-5 text-primary transition-transform group-hover:scale-110" />
                <p className="text-xl font-bold text-gradient">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="relative lg:ps-4"
          {...fade(0.15)}
        >
          <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-bl from-primary/20 via-transparent to-accent/20 blur-2xl" aria-hidden />
          <motion.div
            className="glass-card relative overflow-hidden rounded-3xl border border-white/20 p-1 shadow-elevated"
            animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="rounded-[1.35rem] bg-gradient-to-b from-muted/30 to-background p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-content-center rounded-xl bg-primary/15 text-primary">
                    <MessageCircleMore className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">صندوق واتساب المباشر</p>
                    <p className="text-xs text-muted-foreground">متصل · يعمل بالذكاء الاصطناعي</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                  نشط
                </span>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/50 bg-card/90 p-4 shadow-soft">
                {chatMessages.map((msg, i) => (
                  <motion.div
                    key={msg.text}
                    className={cnBubble(msg.from)}
                    initial={reduceMotion ? false : { opacity: 0, x: msg.from === "patient" ? 12 : -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.35, duration: 0.4 }}
                  >
                    {msg.from === "ai" ? (
                      <Bot className="mb-1 h-3.5 w-3.5 text-primary" aria-hidden />
                    ) : null}
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                  </motion.div>
                ))}
                <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                  <span className="inline-flex gap-0.5">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                        style={{ animationDelay: `${d * 0.15}s` }}
                      />
                    ))}
                  </span>
                  المساعد يكتب...
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarCheck2 className="h-4 w-4 text-primary" />
                    مواعيد اليوم
                  </div>
                  <p className="mt-1 text-2xl font-bold">18</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Bot className="h-4 w-4 text-accent" />
                    ردود تلقائية
                  </div>
                  <p className="mt-1 text-2xl font-bold text-gradient">74%</p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function cnBubble(from: "patient" | "ai") {
  const base = "max-w-[92%] rounded-2xl px-3 py-2";
  if (from === "patient") {
    return `${base} ms-auto bg-muted/80 text-foreground`;
  }
  return `${base} bg-primary/10 text-foreground ring-1 ring-primary/15`;
}
