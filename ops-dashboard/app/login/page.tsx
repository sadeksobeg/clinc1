"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "فشل تسجيل الدخول");
      router.push("/inbox");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-6 text-center text-2xl font-semibold text-white">لوحة العمليات</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <div>
          <label className="mb-1 block text-xs text-slate-400">البريد</label>
          <input
            type="email"
            autoComplete="username"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">كلمة المرور</label>
          <input
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {err ? <p className="text-sm text-red-400">{err}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "…" : "دخول"}
        </button>
      </form>
    </main>
  );
}
