"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
      const otp =
        superAdminMfaStep && devBypassOtp && DEV_SUPERADMIN_OTP
          ? DEV_SUPERADMIN_OTP
          : superAdminMfaStep
            ? otpCode.trim()
            : "";
      const payload: { email: string; password: string; otp_code?: string } = { email, password };
      if (superAdminMfaStep) {
        if (devBypassOtp && DEV_SUPERADMIN_OTP) {
          payload.otp_code = DEV_SUPERADMIN_OTP;
        } else if (otp.length === 6) {
          payload.otp_code = otp;
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
              ? `عنوان IP الذي يصل به الخادم غير مدرج في قائمة السماح: ${seen}. على السيرفر أضف سطرًا في user_ip_allowlist (مثلاً ${seen}/32) للمستخدم super_admin، أو راجع تمرير ترويسة CF-Connecting-IP في nginx.`
              : "عنوان IP الحالي غير مسموح به لتسجيل دخول مشرف المنصة. حدّث قائمة السماح في إعدادات الأمان أو اتصل بالمسؤول.",
          );
        }
        if (
          j.error === "auth_upstream_error" ||
          (r.status >= 500 && !j.error)
        ) {
          throw new Error(
            "حدث خطأ في خادم المصادقة. راجع سجلات حاوية ops-dashboard على الخادم (docker compose logs ops-dashboard) وتأكد من JWT_SECRET وقاعدة البيانات والترحيلات.",
          );
        }
        if (j.error === "mfa_required") {
          throw new Error(
            "رمز المصادقة الثنائية غير صحيح أو منتهٍ. استخدم الرمز الحالي من التطبيق، وتأكد أن الوقت تلقائي على الهاتف وأن المفتاح مطابق لما سجّلته في قاعدة البيانات.",
          );
        }
        if (j.error === "missing_session_cookie") {
          throw new Error(
            "تعذر إنشاء الجلسة بعد نجاح المصادقة. حدّث صفحة الويب (نسخة apps/web) أو أعد بناء حاوية clinic-web؛ قد يكون استخراج Set-Cookie من الخادم الخلفي غير مكتمل.",
          );
        }
        if (
          j.error === "Invalid credentials" ||
          j.error === "invalid_credentials"
        ) {
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background p-6">
      <Card className="w-full max-w-md glass-card">
        <CardHeader>
          <CardTitle>تسجيل الدخول</CardTitle>
          <CardDescription>استخدم حساب العيادة الحالي للدخول الآمن إلى مساحة العمل.</CardDescription>
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
                <p className="text-sm text-muted-foreground">
                  تم التحقق من كلمة المرور. أدخل رمز OTP لمشرف المنصة (TOTP).
                </p>
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
            {err ? <p className="text-sm text-red-500">{err}</p> : null}
            <Button type="submit" disabled={loading}>
              {loading ? "..." : superAdminMfaStep ? "تأكيد OTP والدخول" : "الدخول إلى لوحة القيادة"}
            </Button>
          </form>
          <Button variant="ghost" asChild>
            <Link href="/">العودة إلى الصفحة الرئيسية</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
