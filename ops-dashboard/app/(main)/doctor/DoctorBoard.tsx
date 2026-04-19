"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Appt = {
  id: number;
  starts_at: string;
  status: string;
  patient_arrival_state: string;
  patient_name: string | null;
  chat_id: string;
};

function apiMessage(j: unknown, fallback: string): string {
  if (j && typeof j === "object") {
    const o = j as { error?: string; detail?: string; code?: string };
    const parts = [o.detail, o.error, o.code].filter((x): x is string => Boolean(x));
    return parts.length ? parts.join(" — ") : fallback;
  }
  return fallback;
}

function useAdaptivePoll(activeMs: number, idleMs: number) {
  const [ms, setMs] = useState(activeMs);
  useEffect(() => {
    const sync = () => setMs(typeof document !== "undefined" && document.visibilityState === "visible" ? activeMs : idleMs);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [activeMs, idleMs]);
  return ms;
}

export function DoctorBoard() {
  const [rows, setRows] = useState<Appt[]>([]);
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const pollMs = useAdaptivePoll(5000, 24000);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/doctor/queue", { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(apiMessage(j, "queue"));
      setRows(j.appointments || []);
      setDoctorId(typeof j.doctor_id === "number" ? j.doctor_id : null);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  async function act(id: number, action: "check_in" | "done" | "skip") {
    setBusyId(id);
    try {
      const r = await fetch("/api/doctor/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ appointment_id: id, action }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(apiMessage(j, "action"));
      flash(action === "check_in" ? "تم تسجيل الوصول" : action === "done" ? "تم إكمال الموعد" : "تم التخطي");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusyId(null);
    }
  }

  if (initialLoad) {
    return <p className="text-sm text-slate-400">جاري تحميل الطابور…</p>;
  }

  if (doctorId == null) {
    if (err) {
      return <p className="text-sm text-red-400">{err}</p>;
    }
    return (
      <p className="text-amber-200/90">
        لا يوجد ملف طبيب مربوط بحسابك. اطلب من المسؤول تعيين <code className="text-xs">doctors.staff_user_id</code> لرقم
        مستخدمك.
      </p>
    );
  }

  const next = rows.find((r) => r.status === "confirmed" || r.status === "pending");
  const lateRows = rows.filter((r) => r.patient_arrival_state === "late");

  return (
    <div className="space-y-6">
      {toast ? (
        <p className="rounded border border-emerald-800/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">{toast}</p>
      ) : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      <p className="text-xs text-slate-500">تحديث تلقائي كل {pollMs / 1000} ثانية عندما تكون الصفحة ظاهرة.</p>

      {next ? (
        <section className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-4">
          <h2 className="mb-2 text-sm text-emerald-200">التالي</h2>
          <p className="text-lg text-white">{next.patient_name || next.chat_id}</p>
          <p className="text-sm text-slate-400">{new Date(next.starts_at).toLocaleString("ar-JO")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyId === next.id}
              className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white"
              onClick={() => void act(next.id, "check_in")}
            >
              وصول
            </button>
            <button
              type="button"
              disabled={busyId === next.id}
              className="rounded bg-slate-700 px-3 py-1.5 text-xs text-white"
              onClick={() => void act(next.id, "done")}
            >
              تم
            </button>
            <button
              type="button"
              disabled={busyId === next.id}
              className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300"
              onClick={() => void act(next.id, "skip")}
            >
              تخطي
            </button>
          </div>
        </section>
      ) : null}
      {lateRows.length ? (
        <section className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4">
          <h2 className="mb-2 text-sm text-amber-200">متأخرون ({lateRows.length})</h2>
          <ul className="space-y-1 text-sm text-amber-50/90">
            {lateRows.map((a) => (
              <li key={a.id}>
                {a.patient_name || a.chat_id} — {new Date(a.starts_at).toLocaleTimeString("ar-JO")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2 className="mb-2 text-sm text-slate-400">كل المواعيد ({rows.length})</h2>
        <ul className="space-y-2 text-sm">
          {rows.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/30 px-3 py-2"
            >
              <span>{a.patient_name || a.chat_id}</span>
              <span className="text-slate-500">{new Date(a.starts_at).toLocaleTimeString("ar-JO")}</span>
              <span className="text-xs text-slate-600">{a.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
