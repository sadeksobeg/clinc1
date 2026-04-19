"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Appt = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  patient_arrival_state: string;
  patient_name: string | null;
  chat_id: string;
  doctor_name: string | null;
};

type Doctor = { id: number; display_name: string; specialty: string };

type Patient = { id: number; display_name: string | null; chat_id: string };

type TimelineRow = {
  conversation_id: number;
  state: string;
  dialogue_state: { flow_step?: string; step?: string; last_intent?: string } | null;
  dialogue_version: number | null;
  updated_at: string;
  chat_id: string;
  patient_name: string | null;
  last_message_text: string | null;
  last_message_direction: string | null;
  last_message_at: string | null;
};

type AlertRow = {
  id: number;
  alert_type: string;
  target: string;
  status: string;
  notes: string | null;
  created_at: string;
  conversation_id: number;
  chat_id: string;
  patient_name: string | null;
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

export function SecretaryBoard() {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [tz, setTz] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [dlDoctor, setDlDoctor] = useState("");
  const [busy, setBusy] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [arrivalTab, setArrivalTab] = useState<"all" | "expected" | "late" | "checked_in">("all");
  const [rescheduleAt, setRescheduleAt] = useState<Record<number, string>>({});
  const pollMs = useAdaptivePoll(5000, 28000);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const load = useCallback(async () => {
    try {
      const todayQs = arrivalTab === "all" ? "" : `?arrival=${encodeURIComponent(arrivalTab)}`;
      const [a, d, p, tl, al] = await Promise.all([
        fetch(`/api/secretary/today${todayQs}`, { credentials: "include" }),
        fetch("/api/secretary/doctors", { credentials: "include" }),
        fetch("/api/secretary/patients", { credentials: "include" }),
        fetch("/api/secretary/whatsapp-timeline", { credentials: "include" }),
        fetch("/api/secretary/alerts", { credentials: "include" }),
      ]);
      const aj = await a.json();
      const dj = await d.json();
      const pj = await p.json();
      const tlj = await tl.json();
      const alj = await al.json();
      if (!a.ok) throw new Error(apiMessage(aj, "today"));
      if (!d.ok) throw new Error(apiMessage(dj, "doctors"));
      if (!p.ok) throw new Error(apiMessage(pj, "patients"));
      if (tl.ok) setTimeline((tlj.rows || []) as TimelineRow[]);
      else setTimeline([]);
      if (al.ok) setAlerts((alj.alerts || []) as AlertRow[]);
      else setAlerts([]);
      setAppts(aj.appointments || []);
      setTz(aj.timezone || "");
      setDoctors(dj.doctors || []);
      setPatients(pj.patients || []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setInitialLoad(false);
    }
  }, [arrivalTab]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  async function submitManual(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const iso = new Date(startsAt).toISOString();
      const r = await fetch("/api/secretary/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          patient_id: Number(patientId),
          doctor_id: Number(doctorId),
          starts_at: iso,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(apiMessage(j, "فشل الحجز"));
      flash(`تم الحفظ — موعد #${j.appointment_id ?? ""}`);
      setStartsAt("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppt(id: number) {
    if (!confirm("إلغاء هذا الموعد؟")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/secretary/appointments/${id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(apiMessage(j, "فشل الإلغاء"));
      flash("تم إلغاء الموعد");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleAppt(id: number) {
    const raw = rescheduleAt[id];
    if (!raw) {
      flash("اختر وقت البدء الجديد في الحقل بجانب الموعد");
      return;
    }
    const iso = new Date(raw).toISOString();
    setBusy(true);
    try {
      const r = await fetch(`/api/secretary/appointments/${id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ starts_at: iso }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(apiMessage(j, "فشل إعادة الجدولة"));
      flash("تم تحديث وقت الموعد");
      setRescheduleAt((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function doctorLeft() {
    if (!dlDoctor) return;
    if (!confirm("تأكيد: خروج الطبيب وإزاحة المواعيد؟")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/secretary/doctor-left", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ doctor_id: Number(dlDoctor), shift_minutes: 20 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(apiMessage(j, "فشل"));
      if (j.demo_simulated) flash(String(j.message_ar || "وضع العرض: لم تُنفَّذ إزاحة فعلية."));
      else flash(`تمت الإزاحة — ${Number(j.shifted) || 0} موعد`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  const late = appts.filter((a) => a.patient_arrival_state === "late");

  if (initialLoad && !appts.length && !err) {
    return <p className="text-sm text-slate-400">جاري تحميل لوحة اليوم…</p>;
  }

  return (
    <div className="space-y-8">
      {toast ? (
        <p className="rounded border border-emerald-800/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">{toast}</p>
      ) : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      <p className="text-xs text-slate-500">تحديث تلقائي كل {pollMs / 1000} ثانية عندما تكون الصفحة ظاهرة.</p>

      <section className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
        <h2 className="mb-3 text-sm font-medium text-amber-100">تنبيهات بانتظار المعالجة</h2>
        {!alerts.length ? (
          <p className="text-sm text-slate-500">لا توجد تنبيهات في الطابور.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {alerts.map((x) => (
              <li key={x.id} className="border-b border-slate-800/80 py-2 text-slate-200">
                <span className="text-amber-200/90">{x.alert_type}</span>
                <span className="mx-2 text-slate-500">·</span>
                <span>{x.patient_name || x.chat_id}</span>
                <span className="mx-2 text-xs text-slate-500">محادثة #{x.conversation_id}</span>
                <span className="block text-xs text-slate-500">{new Date(x.created_at).toLocaleString("ar-JO")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-300">زمن واتساب (آخر نشاط)</h2>
        {!timeline.length ? (
          <p className="text-sm text-slate-500">لا توجد محادثات مفتوحة أو لم تُطبَّق ترقية قاعدة البيانات بعد (حقل dialogue_state).</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {timeline.map((x) => (
              <li key={x.conversation_id} className="border-b border-slate-800 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-white">{x.patient_name || x.chat_id}</span>
                  <span className="text-xs text-slate-500">
                    {x.last_message_at ? new Date(x.last_message_at).toLocaleString("ar-JO") : "—"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  حالة {x.state}
                  {x.dialogue_state?.flow_step || x.dialogue_state?.step
                    ? ` · خطوة ${x.dialogue_state.flow_step || x.dialogue_state.step}`
                    : ""}
                  {x.dialogue_state?.last_intent ? ` · آخر نية ${x.dialogue_state.last_intent}` : ""}
                </p>
                {x.last_message_text ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {x.last_message_direction === "outbound" ? "↗ " : "↘ "}
                    {x.last_message_text}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-300">مواعيد اليوم {tz ? `(${tz})` : ""}</h2>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "الكل"],
                ["expected", "متوقع"],
                ["late", "متأخر"],
                ["checked_in", "حضر"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setArrivalTab(key)}
                className={`rounded px-2 py-1 text-xs ${
                  arrivalTab === key ? "bg-slate-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {!appts.length ? (
          <p className="text-slate-500">لا توجد مواعيد.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {appts.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 border-b border-slate-800 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-white">{a.patient_name || a.chat_id}</span>
                    <span className="text-slate-400">{new Date(a.starts_at).toLocaleString("ar-JO")}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="text-slate-500">{a.doctor_name || "—"}</span>
                    <span className="text-amber-200/80">{a.status}</span>
                    <span className="text-slate-600">{a.patient_arrival_state}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    aria-label={`وقت جديد للموعد ${a.id}`}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                    value={rescheduleAt[a.id] ?? ""}
                    onChange={(e) =>
                      setRescheduleAt((prev) => ({
                        ...prev,
                        [a.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busy || a.status === "cancelled"}
                    onClick={() => void rescheduleAppt(a.id)}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700 disabled:opacity-40"
                  >
                    إعادة جدولة
                  </button>
                  <button
                    type="button"
                    disabled={busy || a.status === "cancelled"}
                    onClick={() => void cancelAppt(a.id)}
                    className="rounded border border-red-800/60 bg-red-950/40 px-2 py-1 text-xs text-red-100 hover:bg-red-950/70 disabled:opacity-40"
                  >
                    إلغاء
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {late.length ? <p className="mt-3 text-xs text-amber-300">متأخرون: {late.length}</p> : null}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-300">حجز يدوي</h2>
        <form onSubmit={submitManual} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">المريض</label>
            <select
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              required
            >
              <option value="">—</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.display_name || p.chat_id) + " · " + p.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">الطبيب</label>
            <select
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              required
            >
              <option value="">—</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name} ({d.specialty})
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-500">وقت البدء (محلي)</label>
            <input
              type="datetime-local"
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            حفظ الحجز
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-red-900/40 bg-red-950/20 p-4">
        <h2 className="mb-3 text-sm font-medium text-red-200">الطبيب خرج</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">الطبيب</label>
            <select
              className="rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
              value={dlDoctor}
              onChange={(e) => setDlDoctor(e.target.value)}
            >
              <option value="">—</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || !dlDoctor}
            onClick={() => void doctorLeft()}
            className="rounded border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-100 hover:bg-red-900/60 disabled:opacity-50"
          >
            تنفيذ الإزاحة + إشعار المرضى
          </button>
        </div>
      </section>
    </div>
  );
}
