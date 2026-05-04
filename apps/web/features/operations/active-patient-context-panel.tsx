"use client";

import { useMemo } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { DateTime } from "luxon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toClinicZoned } from "@/lib/format";
import { statusLabel } from "@/lib/i18n/status";
import type { AppointmentProjection } from "@/lib/clinic-brain/v2";
import type { AppointmentRow, InboxRow } from "@/lib/ops-server";
import { arrivalLabel, timeLabel } from "@/features/appointments/use-clinic-day-operations";
import { cn } from "@/lib/utils";

type Props = {
  appointment: AppointmentRow | null;
  inboxRows: InboxRow[];
  clinicTimezone: string;
  onClear: () => void;
  className?: string;
  nowZoned?: DateTime | null;
  enriched?: AppointmentProjection | null;
  /** وضع صارم: معلومات فقط، بدون أزرار تنفيذ */
  contextReadOnly?: boolean;
};

function inboxForPatient(rows: InboxRow[], patientId: number | null | undefined): InboxRow | null {
  if (patientId == null) return null;
  const matches = rows.filter((r) => r.patient_id === patientId);
  if (!matches.length) return null;
  return [...matches].sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  })[0]!;
}

export function ActivePatientContextPanel({
  appointment,
  inboxRows,
  clinicTimezone,
  onClear,
  className,
  nowZoned,
  enriched,
  contextReadOnly = false,
}: Props) {
  const inbox = useMemo(
    () => (appointment ? inboxForPatient(inboxRows, appointment.patient_id) : null),
    [appointment, inboxRows],
  );

  const sessionElapsedMin = useMemo(() => {
    if (!appointment || !nowZoned?.isValid) return null;
    const st = toClinicZoned(appointment.starts_at, clinicTimezone);
    if (!st?.isValid) return null;
    const mins = Math.round(nowZoned.diff(st, "minutes").minutes);
    if (!Number.isFinite(mins) || mins < 1) return null;
    const status = String(appointment.status || "").toLowerCase();
    const arr = String(appointment.patient_arrival_state || "").toLowerCase();
    if (status === "completed" || status === "cancelled" || status === "no_show") return null;
    if (arr === "checked_in" || status === "in_progress" || enriched?.bucket === "NOW") return mins;
    return null;
  }, [appointment, clinicTimezone, nowZoned, enriched?.bucket]);

  if (!appointment) {
    return (
      <div
        className={cn(
          "shrink-0 rounded-2xl border border-dashed border-border/60 bg-muted/15 px-cg-3 py-cg-2 text-ds-small leading-snug text-muted-foreground",
          className,
        )}
      >
        اختر موعدًا من الطابور أو الخريطة الزمنية لعرض السياق هنا.
      </div>
    );
  }

  const start = toClinicZoned(appointment.starts_at, clinicTimezone);
  const end = toClinicZoned(appointment.ends_at, clinicTimezone);
  const delayM = enriched?.delay_minutes ?? 0;

  const glanceLateMin = useMemo(() => {
    if (!appointment || !nowZoned?.isValid) return null;
    const st = toClinicZoned(appointment.starts_at, clinicTimezone);
    if (!st?.isValid) return null;
    const mins = Math.round(nowZoned.diff(st, "minutes").minutes);
    if (!Number.isFinite(mins) || mins < 2) return null;
    const status = String(appointment.status || "").toLowerCase();
    const arr = String(appointment.patient_arrival_state || "").toLowerCase();
    if (status === "completed" || status === "cancelled" || status === "no_show") return null;
    if (arr === "checked_in" || status === "in_progress" || enriched?.bucket === "NOW") return null;
    return mins;
  }, [appointment, clinicTimezone, nowZoned, enriched?.bucket]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-cg-3 border-b border-border/50 px-cg-4 py-cg-3">
        <div className="min-w-0">
          <p className="text-ds-label text-muted-foreground">{contextReadOnly ? "لمحة سريعة" : "سياق التشغيل"}</p>
          <p className="truncate text-ds-body font-semibold text-foreground">
            {appointment.patient_display_name ?? "مريض"}
          </p>
          <p className="mt-cg-0.5 truncate text-ds-small text-muted-foreground">{appointment.doctor_name ?? "—"}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClear} aria-label="إغلاق اللوحة">
          <X className="size-4" />
        </Button>
      </div>

      {contextReadOnly ? (
        <div className="flex min-h-0 flex-1 flex-col gap-cg-3 overflow-auto px-cg-4 pb-cg-4 pt-cg-3 text-ds-small leading-relaxed text-foreground">
          <div>
            <p className="text-ds-label font-medium text-muted-foreground">الآن</p>
            <ul className="mt-cg-1 list-none space-y-cg-1 ps-0">
              {glanceLateMin != null ? <li>متأخر ~{glanceLateMin} د عن وقت الجدول</li> : null}
              {delayM > 0 && glanceLateMin == null ? (
                <li>تأخر تشغيلي متوقع ~{Math.round(delayM)} د</li>
              ) : null}
              {sessionElapsedMin != null ? <li>جلسة منذ ~{sessionElapsedMin} د</li> : null}
              <li>
                موعد الجدول: {start?.isValid ? start.setLocale("ar").toFormat("HH:mm") : "—"}
                {enriched?.expected_start?.isValid ? (
                  <span className="text-muted-foreground">
                    {" "}
                    — متوقع البدء {enriched.expected_start.setLocale("ar").toFormat("HH:mm")}
                  </span>
                ) : null}
              </li>
            </ul>
          </div>
          <div className="border-t border-border/35 pt-cg-2">
            <p className="text-ds-label font-medium text-muted-foreground">آخر رسالة</p>
            {inbox ? (
              <p className="mt-cg-1 line-clamp-4 rounded-md bg-muted/20 p-cg-2 text-foreground">{inbox.last_message ?? "—"}</p>
            ) : (
              <p className="mt-cg-1 text-muted-foreground">لا رسالة.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-cg-3 gap-y-cg-1 border-t border-border/35 pt-cg-2 text-ds-label">
            {appointment.patient_id ? (
              <Link href={`/patients/${appointment.patient_id}`} className="text-primary underline">
                ملف المريض
              </Link>
            ) : null}
            {inbox ? (
              <Link href={`/inbox/${inbox.conversation_id}`} className="text-primary underline">
                فتح المحادثة
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-border/40 px-cg-4 py-cg-2 text-ds-small">
            <p>
              <span className="text-muted-foreground">بدأ الجدول:</span>{" "}
              <span className="font-mono font-medium">{start?.isValid ? start.setLocale("ar").toFormat("HH:mm") : "—"}</span>
              {enriched?.expected_end?.isValid ? (
                <>
                  <span className="mx-1 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">متوقع الانتهاء:</span>{" "}
                  <span className="font-mono font-medium">{enriched.expected_end.setLocale("ar").toFormat("HH:mm")}</span>
                </>
              ) : null}
            </p>
            {sessionElapsedMin != null ? (
              <p className="mt-cg-1 text-ds-label text-primary">
                جلسة منذ ~{sessionElapsedMin} د (من وقت الجدول)
              </p>
            ) : null}
            {delayM > 0 ? (
              <p className="mt-cg-1 text-ds-label text-warning">تأخر تشغيلي متوقع ~{Math.round(delayM)} د</p>
            ) : null}
          </div>

          <Tabs defaultValue="appt" className="flex min-h-0 flex-1 flex-col overflow-hidden px-cg-4 pb-cg-3 pt-cg-2">
        <TabsList className="h-9 w-full shrink-0 justify-start">
          <TabsTrigger value="appt" className="text-ds-label">
            الموعد
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-ds-label">
            المحادثة
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-ds-label">
            ملاحظات
          </TabsTrigger>
        </TabsList>
        <TabsContent value="appt" className="mt-cg-3 min-h-0 max-h-[min(32vh,240px)] flex-1 overflow-auto">
          <div className="space-y-cg-2 text-ds-small">
            <p>
              <span className="text-muted-foreground">النافذة:</span>{" "}
              <span className="font-mono font-medium text-foreground">
                {timeLabel(start)} — {timeLabel(end)}
              </span>
            </p>
            <div className="flex flex-wrap gap-cg-1">
              <Badge variant="outline">{statusLabel(appointment.status)}</Badge>
              {arrivalLabel(appointment.patient_arrival_state) ? (
                <Badge variant="secondary">{arrivalLabel(appointment.patient_arrival_state) ?? ""}</Badge>
              ) : null}
            </div>
            {appointment.patient_id ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/patients/${appointment.patient_id}`}>ملف المريض</Link>
              </Button>
            ) : null}
          </div>
        </TabsContent>
        <TabsContent value="chat" className="mt-cg-3 min-h-0 max-h-[min(32vh,240px)] flex-1 overflow-auto">
          {inbox ? (
            <div className="space-y-cg-2 text-ds-small">
              {inbox.last_inbound_intent ? (
                <p>
                  <span className="text-muted-foreground">آخر نية:</span>{" "}
                  <span className="font-medium text-foreground">{inbox.last_inbound_intent}</span>
                </p>
              ) : null}
              <p className="text-ds-label text-muted-foreground">آخر رسالة</p>
              <p className="line-clamp-4 rounded-md border border-border/50 bg-muted/20 p-cg-2 text-foreground">
                {inbox.last_message ?? "—"}
              </p>
              <Button size="sm" asChild>
                <Link href={`/inbox/${inbox.conversation_id}`}>فتح المحادثة كاملة</Link>
              </Button>
            </div>
          ) : (
            <p className="text-ds-small text-muted-foreground">لا توجد محادثة مطابقة في الصندوق المحمّل.</p>
          )}
        </TabsContent>
        <TabsContent value="notes" className="mt-cg-3 max-h-[min(24vh,180px)] overflow-auto text-ds-small text-muted-foreground">
          مساحة ملاحظات سريرية/تشغيلية — يمكن ربطها لاحقًا بسجل المريض.
        </TabsContent>
      </Tabs>
        </>
      )}
    </div>
  );
}
