"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; otp_required?: boolean };
      if (j.otp_required) {
        setSuperAdminMfaStep(true);
        setOtpCode("");
        setDevBypassOtp(false);
        return;
      }
      if (!r.ok || !j.ok) {
        if (j.error === "auth_unavailable" || r.status === 502) {
          throw new Error(
            "خدمة المصادقة غير متصلة. شغّل ops-dashboard على المنفذ 3001 (من مجلد ops-dashboard: npm run dev) وتأكد أن OPS_DASHBOARD_URL في apps/web يشير إلى نفس العنوان.",
          );
        }
        throw new Error(j.error || "فشل تسجيل الدخول");
      }
      router.push("/dashboard");
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
