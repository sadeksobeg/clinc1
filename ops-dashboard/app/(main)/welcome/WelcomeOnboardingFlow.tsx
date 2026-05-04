"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function WelcomeOnboardingFlow({ clinicName }: { clinicName: string }) {
  const router = useRouter();
  const [screen, setScreen] = useState<1 | 2 | 3 | 4>(1);
  const [slideIndex, setSlideIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const slides = [
    "الرد الذكي على المرضى",
    "تنظيم المواعيد تلقائياً",
    "تقليل ضغط الموظفين",
  ];

  useEffect(() => {
    if (screen === 1) {
      const t = setTimeout(() => setScreen(2), 1200);
      return () => clearTimeout(t);
    }
    if (screen === 2) {
      if (slideIndex < 2) {
        const t = setTimeout(() => setSlideIndex((prev) => Math.min(2, prev + 1)), 1400);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setScreen(3), 1200);
      return () => clearTimeout(t);
    }
    if (screen === 3) {
      const t = setTimeout(() => setScreen(4), 1200);
      return () => clearTimeout(t);
    }
  }, [screen, slideIndex]);

  async function completeAndGo(path: "/inbox?tour=1" | "/analytics") {
    setBusy(true);
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } finally {
      router.push(path);
      router.refresh();
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-right text-white">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Premium onboarding</p>
          {screen < 4 ? (
            <button type="button" className="text-xs text-emerald-400 hover:underline" onClick={() => setScreen(4)}>
              تخطي المقدمة
            </button>
          ) : null}
        </div>

        {screen === 1 ? (
          <div className="space-y-3 py-6 text-center">
            <p className="animate-bounce text-4xl">🎉</p>
            <h1 className="text-2xl font-semibold">مرحبًا بك في مستقبل إدارة العيادات</h1>
            <p className="text-slate-300">تم إنشاء حساب التجربة بنجاح للعيادة {clinicName}.</p>
          </div>
        ) : null}

        {screen === 2 ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-slate-400">ما الذي ستحصل عليه:</p>
            <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
              <p key={slides[slideIndex]} className="animate-pulse text-lg font-semibold">
                {slides[slideIndex]}
              </p>
            </div>
            <div className="flex justify-center gap-2">
              {slides.map((_, idx) => (
                <span key={String(idx)} className={`h-2 w-2 rounded-full ${idx === slideIndex ? "bg-emerald-400" : "bg-slate-600"}`} />
              ))}
            </div>
          </div>
        ) : null}

        {screen === 3 ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-3xl">⏳</p>
            <h2 className="text-2xl font-semibold">لديك 3 أيام مجانًا</h2>
            <p className="text-slate-300">ابدأ التشغيل الآن واستكشف قدرات المنصة مع فريقك.</p>
          </div>
        ) : null}

        {screen === 4 ? (
          <div className="space-y-4 py-3">
            <h2 className="text-2xl font-semibold">جاهز للانطلاق</h2>
            <p className="text-sm text-slate-300">
              هذه الواجهة خاصة بإدارة العيادة (الرسائل، المواعيد، التحليلات) وليست واجهة مريض نهائي.
            </p>
            <ul className="space-y-1 text-sm text-slate-300">
              <li>• متابعة الرسائل الواردة</li>
              <li>• تنفيذ قرارات الحجز</li>
              <li>• مراقبة الأداء اليومي</li>
            </ul>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void completeAndGo("/inbox?tour=1")}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {busy ? "جار التحضير..." : "ابدأ إدارة العيادة الآن"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void completeAndGo("/analytics")}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                عرض التحليلات أولًا
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
