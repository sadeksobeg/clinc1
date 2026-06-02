"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  { from: "patient", text: "② مناسب، أكّد لي الموعد" },
  { from: "ai", text: "تم التأكيد ✅ غداً 2:00 م — سنرسل تذكيراً قبل الموعد." },
];

const headlineWords = ["موظف", "استقبال", "ذكي"];

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? target : 0);

  useEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    const total = 40;
    const id = window.setInterval(() => {
      frame += 1;
      setValue(Math.round((target * frame) / total));
      if (frame >= total) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, [target, reduceMotion]);

  return (
    <span>
      {value}
      {suffix}
    </span>
  );
}

export function LandingHero() {
  const reduceMotion = useReducedMotion();
  const [visibleMsgs, setVisibleMsgs] = useState(1);

  useEffect(() => {
    if (reduceMotion) {
      setVisibleMsgs(chatMessages.length);
      return;
    }
    const id = window.setInterval(() => {
      setVisibleMsgs((n) => (n >= chatMessages.length ? 1 : n + 1));
    }, 2200);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  const fade = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay },
        };

  return (
    <section className="hero-section relative isolate overflow-hidden">
      <div className="hero-mesh hero-mesh-animate pointer-events-none absolute inset-0" aria-hidden />
      <div className="hero-grid pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />
      <div className="hero-orb hero-orb-a pointer-events-none absolute start-0 top-16 h-64 w-64 rounded-full opacity-50 sm:h-80 sm:w-80" aria-hidden />
      <div className="hero-orb hero-orb-b pointer-events-none absolute end-0 top-24 h-72 w-72 rounded-full opacity-40 sm:h-96 sm:w-96" aria-hidden />
      <div className="hero-orb hero-orb-c pointer-events-none absolute bottom-0 start-1/3 h-56 w-56 rounded-full opacity-30" aria-hidden />

      <div className="hero-particles pointer-events-none absolute inset-0" aria-hidden>
        {[...Array(12)].map((_, i) => (
          <span key={i} className="hero-particle" style={{ "--i": i } as CSSProperties} />
        ))}
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <motion.div className="space-y-7" {...fade(0)}>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="secondary" className="w-fit gap-1.5 border-gradient px-3 py-1.5 shadow-soft">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
              <span className="font-medium">{brand.nameAr}</span>
              <span className="text-muted-foreground">—</span>
              <span>تشغيل عيادات بمعايير عالمية</span>
            </Badge>
          </motion.div>

          <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.25rem]">
            <span className="flex flex-wrap gap-x-2 gap-y-1">
              {headlineWords.map((word, i) => (
                <motion.span
                  key={word}
                  className="text-gradient inline-block"
                  initial={reduceMotion ? false : { opacity: 0, y: 30, rotateX: -40 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ delay: 0.15 + i * 0.1, duration: 0.55, type: "spring", stiffness: 120 }}
                >
                  {word}
                </motion.span>
              ))}
            </span>
            <motion.span
              className="mt-2 block text-foreground"
              {...fade(0.35)}
            >
              يعمل لعيادتك{" "}
              <span className="relative inline-block">
                <span className="text-gradient font-black">24/7</span>
                <motion.span
                  className="absolute -inset-x-1 -bottom-0.5 h-2 rounded-full bg-primary/20"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.7, duration: 0.5 }}
                  style={{ originX: 1 }}
                />
              </span>{" "}
              عبر واتساب
            </motion.span>
          </h1>

          <motion.p className="max-w-xl text-lg leading-relaxed text-muted-foreground" {...fade(0.45)}>
            {brand.taglineAr}
          </motion.p>

          <motion.p className="max-w-xl text-base text-foreground/80" {...fade(0.5)}>
            حوّل رسائل المرضى إلى حجوزات مؤكدة — رد فوري، تقويم متعدد الأطباء، ومتابعة تلقائية{" "}
            <strong className="font-semibold text-primary">بدون إرهاق فريق الاستقبال</strong>.
          </motion.p>

          <motion.div className="flex flex-wrap items-center gap-3" {...fade(0.55)}>
            <Button asChild size="lg" variant="brand" className="btn-shimmer h-12 px-8 text-base shadow-glow">
              <Link href="/trial">
                ابدأ 3 أيام مجاناً
                <ArrowLeft className="me-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 border-border/80 bg-background/70 px-8 backdrop-blur-sm">
              <Link href="/demo">شاهد العرض الحي</Link>
            </Button>
          </motion.div>

          <motion.ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" {...fade(0.6)}>
            {["بدون بطاقة دفع", "إعداد خلال دقائق", "دعم عربي كامل"].map((t, i) => (
              <motion.li
                key={t}
                className="flex items-center gap-1.5"
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.65 + i * 0.06 }}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                {t}
              </motion.li>
            ))}
          </motion.ul>

          <div className="grid grid-cols-3 gap-3 pt-1">
            {stats.map((item, i) => (
              <motion.div
                key={item.label}
                className="glass-card group rounded-2xl p-4 text-center hover-lift"
                initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.7 + i * 0.08, type: "spring", stiffness: 140 }}
                whileHover={reduceMotion ? undefined : { y: -4, transition: { duration: 0.2 } }}
              >
                <item.icon className="mx-auto mb-2 h-5 w-5 text-primary transition-transform group-hover:scale-125 group-hover:rotate-3" />
                <p className="text-xl font-bold text-primary">{item.value}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div className="relative mx-auto w-full max-w-lg lg:max-w-none lg:ps-4" {...fade(0.2)}>
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-bl from-primary/25 via-transparent to-accent/20 blur-3xl" aria-hidden />

          <motion.div
            className="mockup-ring relative"
            animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="glass-card relative overflow-hidden rounded-3xl border border-white/25 p-1 shadow-elevated">
              <div className="rounded-[1.35rem] bg-gradient-to-b from-muted/40 to-background p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <motion.span
                      className="grid h-9 w-9 place-content-center rounded-xl bg-primary/15 text-primary"
                      animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    >
                      <MessageCircleMore className="h-5 w-5" />
                    </motion.span>
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

                <div className="relative min-h-[220px] space-y-3 overflow-hidden rounded-2xl border border-border/50 bg-card/95 p-4 shadow-soft">
                  <AnimatePresence mode="popLayout">
                    {chatMessages.slice(0, visibleMsgs).map((msg) => (
                      <motion.div
                        key={msg.text}
                        layout
                        className={cnBubble(msg.from)}
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.35, type: "spring", stiffness: 260, damping: 22 }}
                      >
                        {msg.from === "ai" ? <Bot className="mb-1 h-3.5 w-3.5 text-primary" aria-hidden /> : null}
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                    <span className="inline-flex gap-0.5">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                          style={{ animationDelay: `${d * 0.12}s` }}
                        />
                      ))}
                    </span>
                    المساعد يكتب...
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <motion.div
                    className="rounded-xl border border-border/60 bg-background/80 p-3"
                    whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarCheck2 className="h-4 w-4 text-primary" />
                      مواعيد اليوم
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums">
                      <AnimatedCounter target={18} />
                    </p>
                  </motion.div>
                  <motion.div
                    className="rounded-xl border border-border/60 bg-background/80 p-3"
                    whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Bot className="h-4 w-4 text-accent" />
                      ردود تلقائية
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                      <AnimatedCounter target={74} suffix="%" />
                    </p>
                  </motion.div>
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
    return `${base} ms-auto bg-muted/90 text-foreground shadow-sm`;
  }
  return `${base} bg-primary/12 text-foreground ring-1 ring-primary/20 shadow-sm`;
}
