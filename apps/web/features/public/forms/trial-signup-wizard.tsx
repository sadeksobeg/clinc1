"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTrialSessionId, trackTrialEvent } from "@/lib/analytics/trialFunnel";

const schema = z.object({
  clinicName: z.string().min(2, "اسم العيادة مطلوب"),
  ownerName: z.string().min(2, "اسم المسؤول مطلوب"),
  whatsapp: z.string().min(8, "رقم واتساب غير صحيح"),
  city: z.string().min(2, "المدينة مطلوبة"),
  specialty: z.string().min(2, "التخصص مطلوب"),
  doctorsCount: z.coerce.number().min(1).max(50),
  email: z.string().email("بريد غير صحيح"),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل"),
  confirmPassword: z.string().min(8, "تأكيد كلمة المرور مطلوب"),
});

type Values = z.infer<typeof schema>;

export function TrialSignupWizard() {
  const trialSessionIdRef = useRef<string>("trial_pending");
  const stepEnteredAtRef = useRef<number>(Date.now());
  const lastViewedStepRef = useRef<number | null>(null);
  const rapidClicksRef = useRef<number[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [hasTriedNext, setHasTriedNext] = useState(false);
  const [success, setSuccess] = useState<{ expiresAt: string; directAccessUrl: string; warnings?: Record<string, unknown> } | null>(null);
  const [premiumScreen, setPremiumScreen] = useState<1 | 2 | 3 | 4>(1);
  const [slideIndex, setSlideIndex] = useState(0);

  const form = useForm<Values>({
    defaultValues: {
      clinicName: "",
      ownerName: "",
      whatsapp: "",
      city: "",
      specialty: "",
      doctorsCount: 1,
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const progress = useMemo(() => `${Math.min(step, 4) * 25}%`, [step]);

  useEffect(() => {
    const sid = getTrialSessionId();
    trialSessionIdRef.current = sid;
    void trackTrialEvent("trial_started", {
      trial_session_id: sid,
      step: 1,
    });
  }, []);

  useEffect(() => {
    if (trialSessionIdRef.current === "trial_pending") return;
    if (lastViewedStepRef.current === step) return;
    lastViewedStepRef.current = step;
    stepEnteredAtRef.current = Date.now();
    void trackTrialEvent("trial_step_viewed", {
      trial_session_id: trialSessionIdRef.current,
      step,
    });
  }, [step]);

  useEffect(() => {
    if (!success || step !== 4) return;
    if (premiumScreen === 1) {
      const t = setTimeout(() => setPremiumScreen(2), 1200);
      return () => clearTimeout(t);
    }
    if (premiumScreen === 2) {
      if (slideIndex < 2) {
        const t = setTimeout(() => setSlideIndex((prev) => Math.min(2, prev + 1)), 1400);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPremiumScreen(3), 1200);
      return () => clearTimeout(t);
    }
    if (premiumScreen === 3) {
      const t = setTimeout(() => setPremiumScreen(4), 1400);
      return () => clearTimeout(t);
    }
  }, [success, step, premiumScreen, slideIndex]);

  const step1Schema = schema.pick({
    clinicName: true,
    ownerName: true,
    whatsapp: true,
    city: true,
    specialty: true,
  });
  const step2Schema = schema.pick({ doctorsCount: true });
  const step3Schema = schema.pick({
    email: true,
    password: true,
    confirmPassword: true,
  });

  const validateStepFields = (
    stepFields: Array<keyof Values>,
    stepSchema: z.ZodTypeAny,
  ): boolean => {
    form.clearErrors(stepFields);
    const current = form.getValues();
    const payload = stepFields.reduce((acc, key) => {
      acc[key] = current[key];
      return acc;
    }, {} as Record<string, unknown>);
    const parsed = stepSchema.safeParse(payload);
    if (parsed.success) return true;
    const firstKey = parsed.error.issues[0]?.path?.[0];
    if (typeof firstKey === "string" && stepFields.includes(firstKey as keyof Values)) {
      form.setFocus(firstKey as keyof Values);
    }
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key !== "string") continue;
      if (!stepFields.includes(key as keyof Values)) continue;
      form.setError(key as keyof Values, { type: "manual", message: issue.message });
    }
    return false;
  };

  const next = async () => {
    if (isAdvancing || loading) return;
    const now = Date.now();
    rapidClicksRef.current = [...rapidClicksRef.current.filter((t) => now - t <= 2000), now];
    if (rapidClicksRef.current.length >= 3) {
      void trackTrialEvent("trial_rage_click", {
        trial_session_id: trialSessionIdRef.current,
        step,
      });
    }
    setHasTriedNext(true);
    setIsAdvancing(true);
    try {
      if (step === 1) {
        const fields = ["clinicName", "ownerName", "whatsapp", "city", "specialty"] as const;
        const ok = validateStepFields(
          [...fields],
          step1Schema,
        );
        if (!ok) {
          void trackTrialEvent("trial_validation_failed", {
            trial_session_id: trialSessionIdRef.current,
            step,
            fields: [...fields],
            count: fields.length,
            step_duration_ms: Date.now() - stepEnteredAtRef.current,
          });
          return;
        }
        void trackTrialEvent("trial_step_completed", {
          trial_session_id: trialSessionIdRef.current,
          step,
          step_duration_ms: Date.now() - stepEnteredAtRef.current,
        });
      }
      if (step === 2) {
        const fields = ["doctorsCount"] as const;
        const ok = validateStepFields([...fields], step2Schema);
        if (!ok) {
          void trackTrialEvent("trial_validation_failed", {
            trial_session_id: trialSessionIdRef.current,
            step,
            fields: [...fields],
            count: fields.length,
            step_duration_ms: Date.now() - stepEnteredAtRef.current,
          });
          return;
        }
        void trackTrialEvent("trial_step_completed", {
          trial_session_id: trialSessionIdRef.current,
          step,
          step_duration_ms: Date.now() - stepEnteredAtRef.current,
        });
      }
      if (step === 3) {
        const fields = ["email", "password", "confirmPassword"] as const;
        const ok = validateStepFields(
          [...fields],
          step3Schema,
        );
        if (!ok) {
          void trackTrialEvent("trial_validation_failed", {
            trial_session_id: trialSessionIdRef.current,
            step,
            fields: [...fields],
            count: fields.length,
            step_duration_ms: Date.now() - stepEnteredAtRef.current,
          });
          return;
        }
        if (form.getValues("password") !== form.getValues("confirmPassword")) {
          toast.error("كلمتا المرور غير متطابقتين");
          form.setFocus("confirmPassword");
          void trackTrialEvent("trial_validation_failed", {
            trial_session_id: trialSessionIdRef.current,
            step,
            fields: ["confirmPassword"],
            count: 1,
            step_duration_ms: Date.now() - stepEnteredAtRef.current,
          });
          return;
        }
        void trackTrialEvent("trial_step_completed", {
          trial_session_id: trialSessionIdRef.current,
          step,
          step_duration_ms: Date.now() - stepEnteredAtRef.current,
        });
        void trackTrialEvent("trial_submitted", {
          trial_session_id: trialSessionIdRef.current,
          step,
          step_duration_ms: Date.now() - stepEnteredAtRef.current,
        });
        setLoading(true);
        try {
          const res = await fetch("/api/trial/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form.getValues()),
          });
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            trial?: { clinic_id?: number; expires_at: string; direct_access_url?: string };
            warnings?: Record<string, unknown>;
          };
          if (!res.ok || !json.ok) {
            if (json.error === "review_required") {
              throw new Error("تم اكتشاف تسجيل تجربة سابق، طلبك يحتاج مراجعة فريق المبيعات.");
            }
            throw new Error("failed");
          }
          setSuccess({
            expiresAt: json.trial?.expires_at ?? new Date().toISOString(),
            directAccessUrl: json.trial?.direct_access_url ?? "/login",
            warnings: json.warnings,
          });
          setPremiumScreen(1);
          setSlideIndex(0);
          setStep(4);
          void trackTrialEvent("trial_submit_success", {
            trial_session_id: trialSessionIdRef.current,
            step,
            clinic_id: Number(json.trial?.clinic_id || 0) || undefined,
          });
          toast.success("تم إنشاء تجربتك المجانية");
        } catch (e) {
          void trackTrialEvent("trial_submit_failed", {
            trial_session_id: trialSessionIdRef.current,
            step,
            reason: "request_failed",
          });
          toast.error(e instanceof Error ? e.message : "تعذر إنشاء التجربة حاليا");
        } finally {
          setLoading(false);
        }
        return;
      }
      setStep((s) => Math.min(4, s + 1));
    } catch (e) {
      console.error("Unexpected trial wizard error", e);
      toast.error("تحقق الإدخال فشل بشكل غير متوقع. حاول مرة أخرى.");
    } finally {
      setIsAdvancing(false);
    }
  };

  const currentStepFields: Array<keyof Values> =
    step === 1
      ? ["clinicName", "ownerName", "whatsapp", "city", "specialty"]
      : step === 2
        ? ["doctorsCount"]
        : ["email", "password", "confirmPassword"];
  const showStepErrorBanner =
    hasTriedNext &&
    currentStepFields.some((f) => Boolean(form.formState.errors[f]));

  if (success && step === 4) {
    const trialEnds = new Date(success.expiresAt).toLocaleString("ar-SA");
    const slides = [
      "الرد الذكي على المرضى",
      "تنظيم المواعيد تلقائياً",
      "تقليل ضغط الموظفين",
    ];
    return (
      <Card className="glass-card flex flex-col gap-cg-4 p-cg-5">
        <div className="flex items-center justify-between">
          <p className="text-ds-small text-muted-foreground">تجربة Premium onboarding</p>
          {premiumScreen < 4 ? (
            <button
              type="button"
              onClick={() => setPremiumScreen(4)}
              className="text-ds-small text-primary hover:underline"
            >
              تخطي المقدمة
            </button>
          ) : null}
        </div>

        {premiumScreen === 1 ? (
          <div className="flex flex-col gap-cg-3 py-cg-4 text-center">
            <p className="animate-bounce text-ds-h1">🎉</p>
            <h2 className="text-ds-h1 font-bold">مرحبًا بك في مستقبل إدارة العيادات</h2>
            <p className="text-muted-foreground">تم إنشاء حساب عيادتك بنجاح.</p>
          </div>
        ) : null}

        {premiumScreen === 2 ? (
          <div className="flex flex-col gap-cg-3 py-cg-4 text-center">
            <p className="text-ds-body text-muted-foreground">ما الذي ستحصل عليه في التجربة:</p>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-cg-4">
              <p key={slides[slideIndex]} className="animate-pulse text-ds-h2 font-semibold">
                {slides[slideIndex]}
              </p>
            </div>
            <div className="flex justify-center gap-cg-2">
              {slides.map((_, idx) => (
                <span
                  key={String(idx)}
                  className={`h-2 w-2 rounded-full ${idx === slideIndex ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
          </div>
        ) : null}

        {premiumScreen === 3 ? (
          <div className="flex flex-col gap-cg-3 py-cg-4 text-center">
            <p className="text-ds-h1">⏳</p>
            <h2 className="text-ds-h1 font-bold">لديك 3 أيام مجانًا</h2>
            <p className="text-muted-foreground">تنتهي التجربة في {trialEnds}</p>
          </div>
        ) : null}

        {premiumScreen === 4 ? (
          <div className="flex flex-col gap-cg-3 py-cg-2">
            <h2 className="text-ds-h1 font-bold">ابدأ الآن</h2>
            <p className="text-muted-foreground">
              ستدخل إلى لوحة إدارة العيادة مع جولة موجهة داخلية: الوارد، المواعيد، والتحليلات.
            </p>
            <ul className="flex flex-col gap-cg-1 text-ds-body text-muted-foreground">
              <li>• متابعة الرسائل الواردة</li>
              <li>• إدارة قرارات الحجز</li>
              <li>• مراجعة مؤشرات التشغيل</li>
            </ul>
          </div>
        ) : null}

        {success.warnings && Object.keys(success.warnings).length > 0 ? (
          <p className="text-ds-small text-warning">تم إنشاء التجربة، مع وجود تنبيه إرسال (يمكنك الدخول مباشرة الآن).</p>
        ) : null}
        {premiumScreen >= 4 ? (
          <Button asChild>
            <Link href={success.directAccessUrl}>الدخول إلى لوحة إدارة العيادة</Link>
          </Button>
        ) : (
          <Button type="button" disabled>
            جار تجهيز الجولة...
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="glass-card p-cg-5">
      <div className="mb-cg-5">
        <div className="mb-cg-2 flex items-center justify-between text-ds-body text-muted-foreground">
          <span>الخطوة {step} من 4</span>
          <span>{progress}</span>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: progress }} />
        </div>
      </div>
      <form className="flex flex-col gap-cg-3" onSubmit={(e) => e.preventDefault()}>
        {showStepErrorBanner ? (
          <div className="rounded-lg border border-danger/40 bg-danger/5 px-cg-3 py-cg-2 text-ds-body text-danger">
            يوجد أخطاء في البيانات. يرجى مراجعة الحقول المطلوبة.
          </div>
        ) : null}
        {step === 1 ? (
          <>
            <Input placeholder="اسم العيادة" {...form.register("clinicName")} />
            <Input placeholder="اسم المسؤول" {...form.register("ownerName")} />
            <Input placeholder="رقم واتساب للتواصل الإداري" {...form.register("whatsapp")} />
            <p className="text-ds-small text-muted-foreground">يستخدم للتواصل الإداري حالياً (التفعيل، الفوترة، والدعم).</p>
            <Input placeholder="المدينة" {...form.register("city")} />
            <Input placeholder="التخصص العام" {...form.register("specialty")} />
          </>
        ) : null}
        {step === 2 ? (
          <>
            <p className="text-ds-body text-muted-foreground">تجربة مجانية 3 أيام - 120$ بعد انتهاء التجربة - +30$ لكل طبيب إضافي</p>
            <Input type="number" min={1} max={50} placeholder="عدد الأطباء" {...form.register("doctorsCount", { valueAsNumber: true })} />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <Input placeholder="البريد الإلكتروني" {...form.register("email")} />
            <Input type="password" placeholder="كلمة المرور" {...form.register("password")} />
            <Input type="password" placeholder="تأكيد كلمة المرور" {...form.register("confirmPassword")} />
          </>
        ) : null}
        <div className="flex gap-cg-2 pt-cg-2">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))}>
              السابق
            </Button>
          ) : null}
          <Button type="button" onClick={() => void next()} disabled={loading || isAdvancing}>
            {loading ? "جار إنشاء التجربة..." : step === 3 ? "إنشاء الحساب" : "التالي"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
