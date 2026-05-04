"use client";

import { useEffect, useState } from "react";

type Health = {
  db_ok?: boolean;
  db_latency_ms?: number;
  whatsapp_send_runtime_disabled?: boolean;
  whatsapp_safety?: {
    window_ms: number;
    global_patient_stamps: number;
    global_staff_stamps: number;
    circuit_failures_in_window: number;
    circuit_window_ms: number;
    circuit_threshold: number;
  };
};
type Queues = {
  outbox_pending?: number;
  outbox_blocked?: number;
  dead_letter_events?: number;
  jobs_queued?: number;
  jobs_retrying?: number;
  jobs_dead?: number;
};
type Failures = {
  webhook_failures_24h?: number;
  reminder_failures_24h?: number;
  messaging_failures_24h?: number;
  dead_jobs_24h?: number;
};
type EmergencyStatus = {
  emergency_mode: boolean;
  whatsapp_send_disabled: boolean;
  ai_autoreply_disabled: boolean;
  auto_booking_disabled: boolean;
  emergency_global_disable: boolean;
  latest_snapshot?: {
    id: number;
    reason: string;
    created_at: string;
    queues?: Record<string, number>;
    failures?: Record<string, number>;
  } | null;
};
type Me = { role?: string; scope?: "clinic" | "platform"; clinic_id?: number | null };

export default function OpsCenterPage() {
  const [health, setHealth] = useState<Health>({});
  const [queues, setQueues] = useState<Queues>({});
  const [failures, setFailures] = useState<Failures>({});
  const [timeline, setTimeline] = useState<Array<{ ts: string; source: string; event_name: string }>>([]);
  const [errors, setErrors] = useState<Array<{ fingerprint: string; severity: string; occurrences: number }>>([]);
  const [jobs, setJobs] = useState<Array<{ id: number; job_type: string; status: string; queue_key: string }>>([]);
  const [deadJobs, setDeadJobs] = useState<Array<{ id: number; job_type: string; status: string }>>([]);
  const [simRuns, setSimRuns] = useState<Array<{ id: number; status: string; started_at: string }>>([]);
  const [emergency, setEmergency] = useState<EmergencyStatus>({
    emergency_mode: false,
    whatsapp_send_disabled: false,
    ai_autoreply_disabled: false,
    auto_booking_disabled: false,
    emergency_global_disable: false,
  });
  const [reason, setReason] = useState("incident containment");
  const [busyAction, setBusyAction] = useState<string>("");
  const [drillResult, setDrillResult] = useState<{ status: string; checks?: Record<string, string> } | null>(null);
  const [me, setMe] = useState<Me>({});
  const [targetClinicId, setTargetClinicId] = useState<number>(1);

  const load = async () => {
    const [h, q, f] = await Promise.all([
      fetch("/api/ops/system/health").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ops/system/queues").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ops/system/failures").then((r) => r.json()).catch(() => ({})),
    ]);
    setHealth((h as { health?: Health }).health ?? {});
    setQueues((q as { queues?: Queues }).queues ?? {});
    setFailures((f as { failures?: Failures }).failures ?? {});
    const [t, e, j, d, s, em, meRes] = await Promise.all([
      fetch("/api/ops/system/timeline?limit=20").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ops/system/errors?limit=20").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ops/system/jobs?limit=20").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ops/system/jobs/dead").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ops/system/simulation/runs?limit=10").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ops/system/emergency/status").then((r) => r.json()).catch(() => ({})),
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
    ]);
    setTimeline((t as { timeline?: Array<{ ts: string; source: string; event_name: string }> }).timeline ?? []);
    setErrors((e as { errors?: Array<{ fingerprint: string; severity: string; occurrences: number }> }).errors ?? []);
    setJobs((j as { jobs?: Array<{ id: number; job_type: string; status: string; queue_key: string }> }).jobs ?? []);
    setDeadJobs((d as { jobs?: Array<{ id: number; job_type: string; status: string }> }).jobs ?? []);
    setSimRuns((s as { runs?: Array<{ id: number; status: string; started_at: string }> }).runs ?? []);
    const emergencyState = (em as { emergency?: EmergencyStatus }).emergency;
    if (emergencyState) setEmergency(emergencyState);
    const m = meRes as { role?: string; scope?: "clinic" | "platform"; clinic_id?: number | null };
    if (m?.role) setMe({ role: m.role, scope: m.scope, clinic_id: m.clinic_id ?? null });
    if (Number(m?.clinic_id || 0) > 0) setTargetClinicId(Number(m.clinic_id));
  };

  async function toggleEmergencyMode(mode: "single" | "emergency_mode", enabled: boolean, flagKey?: string) {
    const actionId = `${mode}:${flagKey || "all"}:${enabled ? "on" : "off"}`;
    setBusyAction(actionId);
    try {
      await fetch("/api/ops/system/emergency/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          enabled,
          reason: reason.trim() || "incident containment",
          flag_key: flagKey,
          clinic_id: me.role === "super_admin" && me.scope === "platform" ? targetClinicId : undefined,
        }),
      });
      await load();
    } finally {
      setBusyAction("");
    }
  }

  async function runDrill(
    drillType: "db_degraded" | "whatsapp_failure_spike" | "billing_failure_spike" | "dead_jobs_spike" | "load_burst",
  ) {
    setBusyAction(`drill:${drillType}`);
    try {
      const res = await fetch("/api/ops/system/simulation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_name: `incident_drill_${drillType}`,
          drill_type: drillType,
          clinics: 50,
          conversations_per_day: 600,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string; checks?: Record<string, string> };
      setDrillResult({ status: json.status || "failed", checks: json.checks });
      await load();
    } finally {
      setBusyAction("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex flex-col gap-cg-5">
      <header>
        <p className="text-ds-body text-muted-foreground">مركز التحكم التشغيلي</p>
        <h1 className="text-ds-h1 font-semibold tracking-tight">مركز العمليات</h1>
      </header>
      <div className="grid gap-cg-4 md:grid-cols-3">
        {me.role === "super_admin" && me.scope === "platform" ? (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-cg-4 md:col-span-3">
            <h2 className="mb-cg-2 font-semibold">مشرف منصة (Platform)</h2>
            <p className="mb-cg-2 text-ds-small text-muted-foreground">حدد عيادة مستهدفة عند تنفيذ إجراء يحتاج نطاق عيادة.</p>
            <label className="text-ds-small">
              رقم العيادة المستهدفة
              <input
                className="mt-cg-1 ms-cg-2 w-28 rounded border px-cg-2 py-cg-1 text-ds-small"
                type="number"
                min={1}
                value={targetClinicId}
                onChange={(e) => setTargetClinicId(Math.max(1, Number(e.target.value || 1)))}
              />
            </label>
          </section>
        ) : null}
        <section className="rounded-xl border border-danger/40 bg-danger/10 p-cg-4 md:col-span-3">
          <h2 className="mb-cg-2 font-semibold text-danger">On-Call Quick Card (60 ثانية)</h2>
          <p className="mb-cg-2 text-ds-body text-danger">لو في incident حي: خذ القرار خلال أول دقيقة، ثم فعّل containment.</p>
          <div className="grid gap-cg-2 text-ds-small md:grid-cols-3">
            <div className="rounded border bg-background p-cg-2">1) تأكد من التأثير: queues / errors / jobs</div>
            <div className="rounded border bg-background p-cg-2">2) زر الطوارئ عند وجود خطر على المرضى</div>
            <div className="rounded border bg-background p-cg-2">3) وثّق السبب وابدأ الفرز (triage)</div>
          </div>
        </section>
        <section className="rounded-xl border p-cg-4 md:col-span-3">
          <h2 className="mb-cg-3 font-medium">التحكم بالحوادث</h2>
          <div className="mb-cg-3 flex flex-wrap gap-cg-2 text-ds-small">
            <span className="rounded border px-cg-2 py-cg-1">EmergencyMode: {String(emergency.emergency_mode)}</span>
            <span className="rounded border px-cg-2 py-cg-1">WhatsApp: {String(emergency.whatsapp_send_disabled)}</span>
            <span className="rounded border px-cg-2 py-cg-1">AI: {String(emergency.ai_autoreply_disabled)}</span>
            <span className="rounded border px-cg-2 py-cg-1">AutoBooking: {String(emergency.auto_booking_disabled)}</span>
          </div>
          <label className="mb-cg-2 block text-ds-body">
            السبب
            <input
              className="mt-cg-1 w-full rounded border px-cg-2 py-cg-1 text-ds-body"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب واضح (مطلوب للتوثيق)"
            />
          </label>
          <div className="flex flex-wrap gap-cg-2">
            <button
              className="rounded border border-danger bg-danger px-cg-2 py-cg-1 text-ds-small font-semibold text-white"
              disabled={busyAction.length > 0}
              onClick={() => void toggleEmergencyMode("emergency_mode", true)}
            >
              زر الطوارئ
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              disabled={busyAction.length > 0}
              onClick={() => void toggleEmergencyMode("single", true, "whatsapp_send_disabled")}
            >
              إيقاف واتساب
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              disabled={busyAction.length > 0}
              onClick={() => void toggleEmergencyMode("single", true, "ai_autoreply_disabled")}
            >
              تعطيل الذكاء
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              disabled={busyAction.length > 0}
              onClick={() => void toggleEmergencyMode("single", true, "auto_booking_disabled")}
            >
              تعطيل الحجز التلقائي
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small font-semibold"
              disabled={busyAction.length > 0}
              onClick={() => void toggleEmergencyMode("emergency_mode", true)}
            >
              تفعيل وضع الطوارئ
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              disabled={busyAction.length > 0}
              onClick={() => void toggleEmergencyMode("emergency_mode", false)}
            >
              إنهاء وضع الطوارئ
            </button>
            <button className="rounded border px-cg-2 py-cg-1 text-ds-small" disabled={busyAction.length > 0} onClick={() => void load()}>
              تحديث
            </button>
          </div>
          {emergency.latest_snapshot ? (
            <div className="mt-cg-3 rounded border bg-muted/30 p-cg-2 text-ds-small">
              <p className="font-medium">لقطة تلقائية</p>
              <p>Captured: {new Date(emergency.latest_snapshot.created_at).toLocaleString()}</p>
              <p>السبب: {emergency.latest_snapshot.reason}</p>
              <p>
                Queues pending/blocked: {Number(emergency.latest_snapshot.queues?.outbox_pending || 0)} /{" "}
                {Number(emergency.latest_snapshot.queues?.outbox_blocked || 0)}
              </p>
              <p>
                Failures msg/billing(24h): {Number(emergency.latest_snapshot.failures?.messaging_failures_24h || 0)} /{" "}
                {Number(emergency.latest_snapshot.failures?.webhook_failures_24h || 0)}
              </p>
            </div>
          ) : null}
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 font-medium">صحة النظام</h2>
          <p>DB OK: {String(Boolean(health.db_ok))}</p>
          <p>DB latency: {Number(health.db_latency_ms || 0)} ms</p>
          <p className="mt-cg-2 text-ds-small text-muted-foreground">P7 WhatsApp safety</p>
          <p className="text-ds-small">Runtime WA disabled: {String(Boolean(health.whatsapp_send_runtime_disabled))}</p>
          {health.whatsapp_safety ? (
            <div className="mt-cg-1 flex flex-col gap-cg-1 text-ds-small">
              <p>Global patient sends (window): {health.whatsapp_safety.global_patient_stamps}</p>
              <p>Global staff sends (window): {health.whatsapp_safety.global_staff_stamps}</p>
              <p>
                Circuit failures: {health.whatsapp_safety.circuit_failures_in_window} / threshold{" "}
                {health.whatsapp_safety.circuit_threshold}
              </p>
            </div>
          ) : null}
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 font-medium">الطوابير</h2>
          <p>Pending outbox: {Number(queues.outbox_pending || 0)}</p>
          <p>Blocked outbox: {Number(queues.outbox_blocked || 0)}</p>
          <p>Dead letters: {Number(queues.dead_letter_events || 0)}</p>
          <p>Queued jobs: {Number(queues.jobs_queued || 0)}</p>
          <p>Retrying jobs: {Number(queues.jobs_retrying || 0)}</p>
          <p>Dead jobs: {Number(queues.jobs_dead || 0)}</p>
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 font-medium">الإخفاقات (24h)</h2>
          <p>Webhook failures: {Number(failures.webhook_failures_24h || 0)}</p>
          <p>Reminder failures: {Number(failures.reminder_failures_24h || 0)}</p>
          <p>Messaging failures: {Number(failures.messaging_failures_24h || 0)}</p>
          <p>Dead jobs 24h: {Number(failures.dead_jobs_24h || 0)}</p>
        </section>
      </div>
      <div className="grid gap-cg-4 lg:grid-cols-2">
        <section className="rounded-xl border p-cg-4">
          <div className="mb-cg-3 flex items-center justify-between">
            <h2 className="font-medium">المهام</h2>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              onClick={() => void fetch("/api/ops/system/jobs/run", { method: "POST" })}
            >
              تشغيل مهمة واحدة
            </button>
          </div>
          <div className="flex flex-col gap-cg-1 text-ds-body">
            {jobs.slice(0, 10).map((j) => (
              <p key={j.id}>#{j.id} {j.job_type} ({j.status}) [{j.queue_key}]</p>
            ))}
          </div>
          {deadJobs.length > 0 ? (
            <div className="mt-cg-3 flex flex-col gap-cg-1 border-t pt-cg-2 text-ds-body">
              <p className="font-medium">Dead Jobs</p>
              {deadJobs.slice(0, 10).map((j) => (
                <p key={j.id}>#{j.id} {j.job_type} ({j.status})</p>
              ))}
            </div>
          ) : null}
        </section>
        <section className="rounded-xl border p-cg-4">
          <div className="mb-cg-3 flex items-center justify-between">
            <h2 className="font-medium">محاكاة</h2>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              onClick={() =>
                void fetch("/api/ops/system/simulation/run", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ scenario_name: "p3_quick_check", clinics: 50, conversations_per_day: 500 }),
                })
              }
            >
              تشغيل محاكاة
            </button>
          </div>
          <div className="mb-cg-3 flex flex-wrap gap-cg-2">
            <button className="rounded border px-cg-2 py-cg-1 text-ds-small" disabled={busyAction.length > 0} onClick={() => void runDrill("db_degraded")}>
              اختبار: تدهور قاعدة البيانات
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              disabled={busyAction.length > 0}
              onClick={() => void runDrill("whatsapp_failure_spike")}
            >
              اختبار: زيادة فشل الرسائل
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              disabled={busyAction.length > 0}
              onClick={() => void runDrill("billing_failure_spike")}
            >
              اختبار: زيادة فشل الفوترة
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              disabled={busyAction.length > 0}
              onClick={() => void runDrill("dead_jobs_spike")}
            >
              اختبار: زيادة مهام ميتة
            </button>
            <button
              className="rounded border px-cg-2 py-cg-1 text-ds-small"
              disabled={busyAction.length > 0}
              onClick={() => void runDrill("load_burst")}
            >
              اختبار: ضغط عالي (P7)
            </button>
          </div>
          {drillResult ? (
            <div className="mb-cg-3 rounded border bg-muted/20 p-cg-2 text-ds-small">
              <p className="font-medium">Last Drill Result: {drillResult.status.toUpperCase()}</p>
              {Object.entries(drillResult.checks || {}).map(([key, value]) => (
                <p key={key}>
                  {key}: {value}
                </p>
              ))}
            </div>
          ) : null}
          <div className="flex flex-col gap-cg-1 text-ds-body">
            {simRuns.slice(0, 8).map((r) => (
              <p key={r.id}>Run #{r.id} - {r.status} - {new Date(r.started_at).toLocaleString()}</p>
            ))}
          </div>
        </section>
      </div>
      <div className="grid gap-cg-4 lg:grid-cols-2">
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 font-medium">Unified Timeline</h2>
          <div className="flex flex-col gap-cg-1 text-ds-small">
            {timeline.slice(0, 20).map((x, i) => (
              <p key={`${x.ts}-${i}`}>{new Date(x.ts).toLocaleString()} - [{x.source}] {x.event_name}</p>
            ))}
          </div>
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 font-medium">Error Aggregations</h2>
          <div className="flex flex-col gap-cg-1 text-ds-small">
            {errors.slice(0, 20).map((x) => (
              <p key={x.fingerprint}>{x.severity} - {x.occurrences} - {x.fingerprint.slice(0, 12)}...</p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
