"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/brand/Logo";
import { brand } from "@/lib/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { defaultLandingPath } from "@/lib/rbac/defaultLandingPath";

const DEV_SUPERADMIN_OTP =
  process.env.NODE_ENV !== "production" ? (process.env.NEXT_PUBLIC_SUPERADMIN_DEV_OTP || "").trim() : "";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devBypassOtp, setDevBypassOtp] = useState(false);
  const [superAdminMfaStep, setSuperAdminMfaStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      if (superAdminMfaStep) {
        const canUseDevBypass = Boolean(devBypassOtp && DEV_SUPERADMIN_OTP);
        if (!canUseDevBypass && otpCode.trim().length !== 6) {
          setErr("أدخل رمز OTP مكوّناً من 6 أرقام.");
          setLoading(false);
          return;
        }
      }
      const payload: { email: string; password: string; otp_code?: string } = { email, password };
      if (superAdminMfaStep) {
        if (devBypassOtp && DEV_SUPERADMIN_OTP) {
          payload.otp_code = DEV_SUPERADMIN_OTP;
        } else if (otpCode.trim().length === 6) {
          payload.otp_code = otpCode.trim();
        }
      }
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        otp_required?: boolean;
        upstream_http_status?: number;
        seen_ip?: string;
      };
      if (j.otp_required) {
        setSuperAdminMfaStep(true);
        setOtpCode("");
        setDevBypassOtp(false);
        return;
      }
      if (!r.ok || !j.ok) {
        if (j.error === "auth_misconfigured" || j.error === "auth_unavailable" || r.status === 502 || r.status === 503) {
          throw new Error(
            "خدمة المصادقة غير متصلة أو غير مضبوطة. على السيرفر: تأكد أن حاوية clinic-web لديها OPS_DASHBOARD_URL=http://ops-dashboard:3001 (أو نفس قيمة docker-compose) ثم أعد تشغيل clinic-web.",
          );
        }
        if (j.error === "misconfiguration") {
          throw new Error(
            "إعدادات خادم المصادقة غير صالحة للإنتاج (مثلاً SUPERADMIN_DEV_OTP مفعّل في ops-dashboard). أزل SUPERADMIN_DEV_OTP وNEXT_PUBLIC_SUPERADMIN_DEV_OTP من بيئة الإنتاج وأعد تشغيل ops-dashboard.",
          );
        }
        if (j.error === "ip_not_allowed") {
          const seen = j.seen_ip?.trim();
          throw new Error(
            seen
              ? `عنوان IP الذي يصل به الخادم غير مدرج في قائمة السماح: ${seen}.`
              : "عنوان IP الحالي غير مسموح به لتسجيل دخول مشرف المنصة.",
          );
        }
        if (j.error === "auth_upstream_error" || (r.status >= 500 && !j.error)) {
          throw new Error("حدث خطأ في خادم المصادقة. راجع سجلات ops-dashboard.");
        }
        if (j.error === "mfa_required") {
          throw new Error("رمز المصادقة الثنائية غير صحيح أو منتهٍ.");
        }
        if (j.error === "missing_session_cookie") {
          throw new Error("تعذر إنشاء الجلسة بعد نجاح المصادقة. أعد بناء حاوية clinic-web.");
        }
        if (j.error === "Invalid credentials" || j.error === "invalid_credentials") {
          throw new Error("البريد أو كلمة المرور غير صحيحة.");
        }
        if (j.error === "internal_error" && j.detail) {
          throw new Error(`خطأ داخلي: ${j.detail}`);
        }
        throw new Error(j.error || "فشل تسجيل الدخول");
      }
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = (await meRes.json().catch(() => ({}))) as { role?: string; scope?: string };
      const dest = defaultLandingPath(String(me.role || "admin"), me.scope);
      router.push(dest);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "login_failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 nasaq-gradient opacity-95" />
        <div className="relative z-10">
          <Logo size="lg" className="[&_span]:text-white [&_p]:text-white/90" />
        </div>
        <div className="relative z-10 space-y-4 text-white">
          <h1 className="text-3xl font-bold leading-tight">{brand.taglineAr}</h1>
          <p className="max-w-md text-white/85">{brand.description}</p>
        </div>
        <p className="relative z-10 text-sm text-white/70">© {new Date().getFullYear()} {brand.nameAr}</p>
      </div>

      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md surface-glass animate-slide-up">
          <CardHeader className="lg:hidden">
            <Logo size="md" className="mb-2" />
            <CardTitle>تسجيل الدخول</CardTitle>
            <CardDescription>ادخل إلى مساحة عمل {brand.nameAr} بأمان.</CardDescription>
          </CardHeader>
          <CardHeader className="hidden lg:block">
            <CardTitle>تسجيل الدخول</CardTitle>
            <CardDescription>ادخل إلى مساحة عمل {brand.nameAr} بأمان.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form className="flex flex-col gap-3" onSubmit={onSubmit}>
              <Input
                placeholder="البريد الإلكتروني"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSuperAdminMfaStep(false);
                  setOtpCode("");
                  setDevBypassOtp(false);
                }}
                required
                disabled={superAdminMfaStep}
              />
              <Input
                type="password"
                placeholder="كلمة المرور"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSuperAdminMfaStep(false);
                  setOtpCode("");
                  setDevBypassOtp(false);
                }}
                required
              />
              {superAdminMfaStep ? (
                <>
                  <p className="text-sm text-muted-foreground">أدخل رمز OTP لمشرف المنصة (TOTP).</p>
                  <Input
                    placeholder="رمز OTP (6 أرقام)"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    disabled={devBypassOtp && Boolean(DEV_SUPERADMIN_OTP)}
                    required={!devBypassOtp || !DEV_SUPERADMIN_OTP}
                  />
                  {DEV_SUPERADMIN_OTP ? (
                    <label className="flex select-none items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span>تجاوز OTP (تطوير)</span>
                        <Badge variant="outline">DEV</Badge>
                      </span>
                      <input
                        type="checkbox"
                        checked={devBypassOtp}
                        onChange={(e) => setDevBypassOtp(e.target.checked)}
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
              {err ? <p className="text-sm text-danger">{err}</p> : null}
              <Button type="submit" variant="brand" disabled={loading} className="w-full">
                {loading ? "..." : superAdminMfaStep ? "تأكيد والدخول" : "الدخول"}
              </Button>
            </form>
            <Button variant="ghost" asChild>
              <Link href="/">العودة إلى {brand.nameAr}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
