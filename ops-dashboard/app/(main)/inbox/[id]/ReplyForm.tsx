"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ReplyForm({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: t }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || j.detail || "فشل الإرسال");
      setText("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
      <label className="block text-sm text-slate-300">رد يدوي عبر الجسر</label>
      <textarea
        className="min-h-[100px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="اكتب الرد..."
        maxLength={4000}
      />
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "جاري الإرسال…" : "إرسال"}
      </button>
    </form>
  );
}
