"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import {
  AlertTriangle,
  Bot,
  CalendarCheck2,
  Clock3,
  MessageCircleMore,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NurseCommandCenter } from "@/features/operations/nurse-command-center";
import type { InboxRow } from "@/lib/ops-server";
import type { AppointmentRow, DoctorRow, PatientRow } from "@/lib/ops-server";
import { isSameClinicDay } from "@/lib/format";

function formatRelative(ts: string | null | undefined): string {
  if (!ts) return "—";
  const t = DateTime.fromISO(ts);
  if (!t.isValid) return "—";
  const m = DateTime.now().diff(t, "minutes").minutes;
  if (m < 2) return "الآن";
  if (m < 60) return `${Math.round(m)}د`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}س`;
  return t.toRelative({ locale: "ar" }) ?? "أمس";
}

function appointmentStatusBadge(status: string, late?: boolean) {
  if (late) return <Badge variant="danger">متأخر</Badge>;
  const s = status.toLowerCase();
  if (s === "completed" || s === "done") return <Badge variant="outline">انتهى</Badge>;
  if (s === "checked_in" || s === "in_progress") return <Badge variant="success">يراجع</Badge>;
  if (s === "confirmed" || s === "scheduled") return <Badge variant="secondary">ينتظر</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function NurseDashboard({
  appointments,
  inboxRows,
  doctors,
  patients,
  clinicTimezone,
  aiAutomationPct,
}: {
  appointments: AppointmentRow[];
  inboxRows: InboxRow[];
  doctors: DoctorRow[];
  patients: PatientRow[];
  clinicTimezone: string;
  aiAutomationPct: number | null;
}) {
  const now = DateTime.now().setZone(clinicTimezone);
  const todayAppts = appointments.filter((a) => isSameClinicDay(a.starts_at, new Date(), clinicTimezone));
  const waiting = todayAppts.filter((a) => {
    const s = String(a.status || "").toLowerCase();
    return s === "scheduled" || s === "confirmed" || s === "pending";
  }).length;
  const late = todayAppts.filter((a) => {
    const start = DateTime.fromISO(a.starts_at).setZone(clinicTimezone);
    return start.isValid && start < now && String(a.status || "").toLowerCase() !== "completed";
  }).length;
  const unread = inboxRows.filter((r) => r.unread).length;
  const needReply = inboxRows.filter(
    (r) => r.unread || String(r.state || "").toUpperCase() === "PENDING_HANDOFF",
  ).length;
  const handoffAlerts = inboxRows.filter((r) => String(r.state || "").toUpperCase() === "PENDING_HANDOFF");

  const recentMessages = [...inboxRows]
    .sort((a, b) => {
      const ta = a.last_message_at ? DateTime.fromISO(a.last_message_at).toMillis() : 0;
      const tb = b.last_message_at ? DateTime.fromISO(b.last_message_at).toMillis() : 0;
      return tb - ta;
    })
    .slice(0, 5);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-cg-5">
      <PageHeader
        title="لوحة الممرضة"
        subtitle={`${now.setLocale("ar").toFormat("cccc، d MMMM yyyy")} — الدوام`}
        description="طابور حي، مواعيد اليوم، ورسائل تحتاج متابعة."
        right={
          <Button asChild variant="outline" size="sm">
            <Link href="/inbox">فتح صندوق المحادثات</Link>
          </Button>
        }
      />

      <div className="grid gap-cg-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="مواعيد اليوم" value={todayAppts.length} hint={waiting ? `${waiting} منتظرون الآن` : undefined} icon={CalendarCheck2} href="/appointments" />
        <StatCard label="رسائل جديدة" value={unread} hint={needReply ? `${needReply} تحتاج رد` : undefined} icon={MessageCircleMore} href="/inbox" />
        <StatCard label="متأخرون" value={late} hint={late ? "تجاوزوا الوقت" : undefined} icon={Clock3} href="/appointments" tone={late ? "danger" : "default"} />
        <StatCard
          label="أتمتة AI"
          value={aiAutomationPct != null ? `${aiAutomationPct}%` : "—"}
          hint="من الردود اليوم"
          icon={Bot}
          href="/ai-center"
          tone="ai"
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-cg-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="glass-card flex min-h-[320px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/50 px-cg-4 py-cg-3">
            <div className="flex items-center gap-cg-2">
              <CalendarCheck2 className="h-4 w-4 text-primary" />
              <h2 className="text-[14px] font-semibold">مواعيد اليوم</h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-8 text-[12px]">
              <Link href="/appointments">عرض الكل</Link>
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {todayAppts.length === 0 ? (
              <p className="p-cg-4 text-[13px] text-muted-foreground">لا توجد مواعيد اليوم.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {todayAppts.slice(0, 12).map((a) => {
                  const start = DateTime.fromISO(a.starts_at).setZone(clinicTimezone);
                  const isLate =
                    start.isValid && start < now && String(a.status || "").toLowerCase() !== "completed";
                  return (
                    <li key={a.id} className="flex items-center gap-cg-3 px-cg-4 py-cg-3">
                      <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">
                        {start.isValid ? start.toFormat("HH:mm") : "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{a.patient_display_name ?? "مريض"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{a.doctor_name ?? "طبيب"}</p>
                      </div>
                      {appointmentStatusBadge(String(a.status || ""), isLate)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-cg-4">
          <section className="glass-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/50 px-cg-4 py-cg-3">
              <div className="flex items-center gap-cg-2">
                <MessageCircleMore className="h-4 w-4 ai-panel-accent" />
                <h2 className="text-[14px] font-semibold">آخر الرسائل</h2>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-8 text-[12px]">
                <Link href="/inbox">فتح البريد</Link>
              </Button>
            </div>
            <ul className="divide-y divide-border/40">
              {recentMessages.length === 0 ? (
                <li className="p-cg-4 text-[13px] text-muted-foreground">لا توجد محادثات.</li>
              ) : (
                recentMessages.map((m) => (
                  <li key={m.conversation_id}>
                    <Link href={`/inbox/${m.conversation_id}`} className="block px-cg-4 py-cg-3 hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-cg-2">
                        <p className="truncate text-[13px] font-semibold">{m.display_name ?? m.chat_id}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(m.last_message_at)}</span>
                      </div>
                      <p className="mt-cg-1 line-clamp-1 text-[12px] text-muted-foreground">{m.last_message ?? "—"}</p>
                      {m.last_inbound_intent ? (
                        <Badge variant="outline" className="mt-cg-2 text-[10px]">
                          AI: {m.last_inbound_intent}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="glass-card p-cg-4">
            <div className="mb-cg-3 flex items-center gap-cg-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="text-[14px] font-semibold">تنبيهات</h2>
            </div>
            <ul className="flex flex-col gap-cg-2 text-[12px]">
              {late > 0 ? (
                <li className="flex gap-cg-2 rounded-lg border border-danger/30 bg-danger/5 px-cg-3 py-cg-2 text-danger">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{late} موعد متأخر اليوم — راجع الجدول.</span>
                </li>
              ) : null}
              {handoffAlerts.slice(0, 3).map((h) => (
                <li key={h.conversation_id} className="flex gap-cg-2 rounded-lg ai-panel-border ai-panel-bg px-cg-3 py-cg-2">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 ai-panel-accent" />
                  <span>
                    AI طلب تدخل بشري — {h.display_name ?? h.chat_id}
                    {h.handoff_reason ? `: ${h.handoff_reason}` : ""}
                  </span>
                </li>
              ))}
              {late === 0 && handoffAlerts.length === 0 ? (
                <li className="text-muted-foreground">لا تنبيهات عاجلة الآن.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>

      <details className="glass-card group">
        <summary className="cursor-pointer list-none px-cg-4 py-cg-3 text-[13px] font-medium text-muted-foreground marker:content-none">
          مركز التشغيل المتقدم (طابور الممرضة)
        </summary>
        <div className="border-t border-border/50 p-cg-3">
          <NurseCommandCenter
            rows={appointments}
            doctors={doctors}
            patients={patients}
            inboxRows={inboxRows}
            clinicTimezone={clinicTimezone}
            clinicWorkingHours={[]}
          />
        </div>
      </details>
    </div>
  );
}
