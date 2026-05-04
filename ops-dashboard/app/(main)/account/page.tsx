"use client";

import { useEffect, useState } from "react";

type Profile = {
  name: string;
  email: string;
  phone: string;
  avatar: string;
  timezone: string;
  language: string;
};

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [security, setSecurity] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/account/profile", { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; profile?: Profile; error?: string };
        if (!r.ok || !j.ok || !j.profile) throw new Error(j.error || "failed");
        setProfile(j.profile);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "save_failed");
      setMsg("تم حفظ الملف الشخصي.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/account/security/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(security),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "password_change_failed");
      setMsg("تم تغيير كلمة المرور بنجاح.");
      setSecurity({ current_password: "", new_password: "", confirm_password: "" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "password_change_failed");
    }
  }

  async function logoutAll() {
    await fetch("/api/account/security/logout-all", { method: "POST" });
    window.location.href = "/login";
  }

  async function restartOnboardingTour() {
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/onboarding/reset", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "onboarding_reset_failed");
      try {
        window.localStorage.removeItem("ops_inbox_tour_done_v1");
      } catch {
        // ignore storage failures
      }
      window.location.href = "/welcome";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "onboarding_reset_failed");
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-5xl px-4 py-6 text-slate-300">جاري تحميل الحساب...</main>;
  }
  if (!profile) {
    return <main className="mx-auto max-w-5xl px-4 py-6 text-red-400">تعذر تحميل بيانات الحساب.</main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold text-white">مركز الحساب</h1>
      {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <section className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-2">
        <h2 className="md:col-span-2 text-lg font-semibold text-white">Profile</h2>
        <Input label="الاسم" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} />
        <Input label="البريد" value={profile.email} onChange={() => undefined} disabled />
        <Input label="الهاتف" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
        <Input label="Avatar URL" value={profile.avatar} onChange={(v) => setProfile({ ...profile, avatar: v })} />
        <Input label="Timezone" value={profile.timezone} onChange={(v) => setProfile({ ...profile, timezone: v })} />
        <Input label="Language" value={profile.language} onChange={(v) => setProfile({ ...profile, language: v })} />
        <div className="md:col-span-2">
          <button onClick={saveProfile} disabled={saving} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50">
            {saving ? "جار الحفظ..." : "حفظ الملف الشخصي"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-2">
        <h2 className="md:col-span-2 text-lg font-semibold text-white">Security</h2>
        <Input
          label="كلمة المرور الحالية"
          type="password"
          value={security.current_password}
          onChange={(v) => setSecurity({ ...security, current_password: v })}
        />
        <Input
          label="كلمة المرور الجديدة"
          type="password"
          value={security.new_password}
          onChange={(v) => setSecurity({ ...security, new_password: v })}
        />
        <Input
          label="تأكيد كلمة المرور"
          type="password"
          value={security.confirm_password}
          onChange={(v) => setSecurity({ ...security, confirm_password: v })}
        />
        <div className="md:col-span-2 flex gap-2">
          <button onClick={changePassword} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500">
            تغيير كلمة المرور
          </button>
          <button onClick={logoutAll} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
            Logout all devices
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
        <h2 className="text-lg font-semibold text-white">Billing & Activity</h2>
        <p className="mt-2">يمكنك إدارة الاشتراك من صفحة الفوترة وعرض حالة الخطة الحالية.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a href="/billing" className="inline-block text-emerald-400 hover:text-emerald-300">
            فتح صفحة الفوترة
          </a>
          <button
            onClick={restartOnboardingTour}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            إعادة الجولة التعريفية
          </button>
        </div>
      </section>
    </main>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="text-sm text-slate-300">
      <span className="mb-1 block text-xs text-slate-400">{props.label}</span>
      <input
        type={props.type || "text"}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-60"
      />
    </label>
  );
}
