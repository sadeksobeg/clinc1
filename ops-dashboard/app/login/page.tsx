"use client";

import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4" />}>
      <LoginInner />
    </Suspense>
  );
}

const DEV_SUPERADMIN_OTP =
  process.env.NODE_ENV !== "production" ? (process.env.NEXT_PUBLIC_SUPERADMIN_DEV_OTP || "").trim() : "";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devBypassOtp, setDevBypassOtp] = useState(false);
  const [superAdminMfaStep, setSuperAdminMfaStep] = useState(false);
  const [resetToken, setResetToken] = useState(search.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const modeFromUrl = search.get("mode");
  const initialMode = modeFromUrl === "forgot" || modeFromUrl === "reset" ? modeFromUrl : "login";
  const [mode, setMode] = useState<"login" | "forgot" | "reset">(initialMode);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (superAdminMfaStep) {
        const canUseDevBypass = Boolean(devBypassOtp && DEV_SUPERADMIN_OTP);
        if (!canUseDevBypass && otpCode.trim().length !== 6) {
          setErr("أدخل رمز OTP مكوّناً من 6 أرقام.");
          setBusy(false);
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
      if (!r.ok || !j.ok) throw new Error(j.error || "فشل تسجيل الدخول");
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function onForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "تعذر إرسال طلب الاستعادة");
      setMsg("إذا كان البريد مسجلا، تم إرسال رابط إعادة تعيين كلمة المرور.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function onResetSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken,
          password: newPassword,
          confirm_password: newPasswordConfirm,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "تعذر إعادة تعيين كلمة المرور");
      setMsg("تم تحديث كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.");
      setMode("login");
      setPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-center text-2xl font-semibold text-white">لوحة إدارة العيادة</h1>
      <p className="mb-6 text-center text-xs text-slate-400">دخول مالك/فريق العيادة لإدارة الرسائل والمواعيد</p>
      <div className="mb-3 flex items-center justify-center gap-2 text-xs">
        <button
          onClick={() => {
            setMode("login");
            setSuperAdminMfaStep(false);
            setOtpCode("");
            setDevBypassOtp(false);
          }}
          className={mode === "login" ? "text-emerald-400" : "text-slate-400"}
        >
          دخول
        </button>
        <span className="text-slate-600">|</span>
        <button onClick={() => setMode("forgot")} className={mode === "forgot" ? "text-emerald-400" : "text-slate-400"}>
          نسيت كلمة المرور
        </button>
        <span className="text-slate-600">|</span>
        <button onClick={() => setMode("reset")} className={mode === "reset" ? "text-emerald-400" : "text-slate-400"}>
          إعادة التعيين
        </button>
      </div>
      <form
        onSubmit={mode === "login" ? onSubmit : mode === "forgot" ? onForgotSubmit : onResetSubmit}
        className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-6"
      >
        {mode === "login" || mode === "forgot" ? (
          <div>
            <label className="mb-1 block text-xs text-slate-400">البريد</label>
            <input
              type="email"
              autoComplete="username"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSuperAdminMfaStep(false);
                setOtpCode("");
                setDevBypassOtp(false);
              }}
              required
              disabled={mode === "login" && superAdminMfaStep}
            />
          </div>
        ) : null}
        {mode === "login" ? (
          <div>
            <label className="mb-1 block text-xs text-slate-400">كلمة المرور</label>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setSuperAdminMfaStep(false);
                setOtpCode("");
                setDevBypassOtp(false);
              }}
              required
            />
          </div>
        ) : null}
        {mode === "login" && superAdminMfaStep ? (
          <>
            <p className="text-xs text-slate-400">تم التحقق من كلمة المرور. أدخل رمز OTP لمشرف المنصة.</p>
            <div>
              <label className="mb-1 block text-xs text-slate-400">رمز OTP</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                disabled={devBypassOtp && Boolean(DEV_SUPERADMIN_OTP)}
                required={!devBypassOtp || !DEV_SUPERADMIN_OTP}
              />
            </div>
            {DEV_SUPERADMIN_OTP ? (
              <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span>تجاوز OTP (تطوير)</span>
                <input type="checkbox" checked={devBypassOtp} onChange={(e) => setDevBypassOtp(e.target.checked)} />
              </label>
            ) : null}
          </>
        ) : null}
        {mode === "reset" ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-slate-400">رمز إعادة التعيين</label>
              <input
                type="text"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">كلمة المرور الجديدة</label>
              <input
                type="password"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">تأكيد كلمة المرور الجديدة</label>
              <input
                type="password"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                required
              />
            </div>
          </>
        ) : null}
        {err ? <p className="text-sm text-red-400">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy
            ? "..."
            : mode === "login"
              ? superAdminMfaStep
                ? "تأكيد OTP"
                : "دخول"
              : mode === "forgot"
                ? "إرسال رابط الاستعادة"
                : "تحديث كلمة المرور"}
        </button>
      </form>
    </main>
  );
}
