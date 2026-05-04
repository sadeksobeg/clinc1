"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { cn } from "@/lib/utils";
import {
  delayAlertOperationalText,
  reminderBeforeAppointmentText,
} from "@/lib/clinic-message-templates";
import { localizeApiError } from "@/lib/i18n/errors";
import type { DoctorRow, InboxRow, PatientRow } from "@/lib/ops-server";
import { sendConversationReply } from "@/features/appointments/use-clinic-day-operations";
import type { ClinicDayOperationsResult } from "@/features/appointments/use-clinic-day-operations";
import { pickPriorityInboxRow } from "@/features/operations/nurse-inbox-peek";
import { defaultWalkInStartsAtIso, findPatientsByPhoneDigits } from "@/features/operations/nurse-walk-in-utils";
import { suggestWalkInPlacement } from "@/lib/clinic-brain/walkin";
import { getEffectiveDurationForProjection } from "@/lib/doctor-duration-learning";

type Props = {
  ops: ClinicDayOperationsResult;
  clinicTimezone: string;
  doctors: DoctorRow[];
  patients: PatientRow[];
  inboxRows: InboxRow[];
  /** After successful walk-in creation, parent can focus the new row in queue/timeline. */
  onWalkInCreated?: (appointmentId: number) => void;
  /** compact = دخول سريع + روابط أساسية فقط (تخطيط OS v3) */
  variant?: "full" | "compact";
};

export function NurseActionPanel({
  ops,
  clinicTimezone,
  doctors,
  patients,
  inboxRows,
  onWalkInCreated,
  variant = "full",
}: Props) {
  const isCompact = variant === "compact";

  const {
    todayTimeline,
    sendOperationalToPatient,
    openPatientConversationWithDraft,
    createAppointment,
    appointments,
    nowZoned,
    getDoctorSlotMinutes,
    etaMinutesFor,
    hardOperationalLock,
    activeOperationalSessionAppointmentId,
  } = ops;

  const sessionPeekPatientId = useMemo(() => {
    if (activeOperationalSessionAppointmentId == null) return null;
    return appointments.find((a) => a.id === activeOperationalSessionAppointmentId)?.patient_id ?? null;
  }, [activeOperationalSessionAppointmentId, appointments]);

  const peek = useMemo(
    () => pickPriorityInboxRow(inboxRows, sessionPeekPatientId),
    [inboxRows, sessionPeekPatientId],
  );

  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");
  const [walkDoctorId, setWalkDoctorId] = useState<string>(doctors[0] ? String(doctors[0].id) : "");
  const [walkBusy, setWalkBusy] = useState(false);

  const walkInRecognized = useMemo((): PatientRow | null => {
    const digits = walkPhone.replace(/\D/g, "");
    if (digits.length < 5) return null;
    const matches = findPatientsByPhoneDigits(patients, walkPhone);
    if (matches.length !== 1) return null;
    return matches[0]!;
  }, [walkPhone, patients]);

  const walkInPreview = useMemo(() => {
    const docId = Number(walkDoctorId || 0);
    if (!docId) return null;
    const doctorAppointments = appointments.filter((a) => a.doctor_id === docId);
    return suggestWalkInPlacement({
      doctorDayAppointments: doctorAppointments,
      now: nowZoned,
      clinicTimezone,
      effectiveMinutesFor: (a) => getEffectiveDurationForProjection(a, getDoctorSlotMinutes(a.doctor_id)),
      walkInMinutes: 15,
    });
  }, [walkDoctorId, appointments, nowZoned, clinicTimezone, getDoctorSlotMinutes]);

  const [quickReply, setQuickReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  async function submitWalkIn() {
    const matches = findPatientsByPhoneDigits(patients, walkPhone);
    if (matches.length === 0) {
      toast.error("لا يوجد مريض بهذا الرقم في القائمة المحمّلة.", {
        description:
          "أضف المريض من صفحة المرضى أو تحقق من الرقم. المحادثات تكون عبر صندوق العيادة فقط — لا يُفتح واتساب ويب من التطبيق.",
      });
      return;
    }
    if (matches.length > 1 && walkName.trim()) {
      const needle = walkName.trim().toLowerCase();
      const narrowed = matches.filter((m) => (m.display_name ?? "").toLowerCase().includes(needle));
      if (narrowed.length === 1) {
        void finalizeWalkIn(narrowed[0]!.id);
        return;
      }
    }
    if (matches.length > 1) {
      toast.message("أكثر من مريض يطابق الرقم — اضبط الاسم أو اختر من المرضى.");
      return;
    }
    void finalizeWalkIn(matches[0]!.id);
  }

  async function finalizeWalkIn(patientId: number) {
    const docId = Number(walkDoctorId || 0);
    if (!docId) {
      toast.error("اختر طبيبًا.");
      return;
    }
    setWalkBusy(true);
    try {
      const startsAt = defaultWalkInStartsAtIso(clinicTimezone);
      const out = await createAppointment({
        doctor_id: docId,
        patient_id: patientId,
        starts_at: startsAt,
        idempotency_key: `walkin-${patientId}-${Date.now()}`,
      });
      if (!out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر إنشاء الموعد.");
        return;
      }
      toast.success("تمت إضافة موعد الدخول السريع.");
      setWalkPhone("");
      setWalkName("");
      if (typeof out.appointment_id === "number") {
        onWalkInCreated?.(out.appointment_id);
      }
    } finally {
      setWalkBusy(false);
    }
  }

  async function sendQuickChip(_label: string, body: string) {
    if (!peek) return;
    setReplyBusy(true);
    try {
      await sendConversationReply(peek.conversation_id, body, `nurse-chip-${peek.conversation_id}-${Date.now()}`);
      toast.success("تم إرسال الرد السريع.");
    } catch (e) {
      toast.error(localizeApiError(e instanceof Error ? e.message : "تعذر الإرسال"));
    } finally {
      setReplyBusy(false);
    }
  }

  async function sendPeekReply() {
    if (!peek) return;
    const text = quickReply.trim();
    if (!text) {
      toast.error("اكتب نصًا للرد.");
      return;
    }
    setReplyBusy(true);
    try {
      await sendConversationReply(peek.conversation_id, text, `nurse-quick-${peek.conversation_id}-${Date.now()}`);
      toast.success("تم إرسال الرد.");
      setQuickReply("");
    } catch (e) {
      toast.error(localizeApiError(e instanceof Error ? e.message : "تعذر الإرسال"));
    } finally {
      setReplyBusy(false);
    }
  }

  const next = todayTimeline.next;

  return (
    <WorkspacePanel
      title={isCompact ? "دخول سريع" : "إجراءات سريعة"}
      subtitle={isCompact ? "هاتف + طبيب" : "من دون مغادرة الصفحة"}
      className="flex min-h-0 min-w-0 flex-col"
      contentClassName={cn(
        "flex min-h-0 flex-col gap-cg-4 overflow-auto p-cg-4",
        hardOperationalLock && "pointer-events-none opacity-45 select-none",
        isCompact && "gap-cg-3 p-cg-3",
      )}
    >
      {hardOperationalLock ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/[0.07] px-cg-3 py-cg-2 text-ds-small font-medium text-destructive">
          الوضع الصارم نشط — أكمل توصية الشريط العلوي قبل الإجراءات الجانبية.
        </p>
      ) : null}
      <div className="rounded-2xl border border-border/70 bg-muted/25 p-cg-3">
        <div className="flex flex-wrap items-center justify-between gap-cg-2">
          <p className="text-ds-small font-semibold">+ مريض للطابور</p>
          <Button variant="ghost" className="h-auto p-0 text-ds-label text-primary underline-offset-4 hover:underline" asChild>
            <Link href="/patients">المرضى</Link>
          </Button>
        </div>
        <p className="mt-cg-1 text-ds-label text-muted-foreground">هاتف مسجّل في العيادة + طبيب — يُنشأ موعد فورًا.</p>
        <div className="mt-cg-3 flex flex-col gap-cg-2">
          <div className="flex flex-col gap-cg-2 sm:flex-row sm:items-end">
            <Input
              className="sm:flex-1"
              placeholder="الهاتف"
              value={walkPhone}
              onChange={(e) => setWalkPhone(e.target.value)}
              inputMode="tel"
            />
            <Select value={walkDoctorId} onValueChange={setWalkDoctorId}>
              <SelectTrigger className="sm:w-[11rem]">
                <SelectValue placeholder="الطبيب" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              className="sm:shrink-0"
              disabled={walkBusy || !walkPhone.trim()}
              onClick={() => void submitWalkIn()}
            >
              {walkBusy ? "…" : "إضافة"}
            </Button>
          </div>
          <Input
            className="text-ds-label"
            placeholder="الاسم (عند تعدد التطابق فقط)"
            value={walkName}
            onChange={(e) => setWalkName(e.target.value)}
          />
          {walkInPreview ? (
            <div
              className={cn(
                "rounded-lg border px-cg-2 py-cg-1.5 text-ds-label",
                walkInPreview.willDelaySubsequent
                  ? "border-warning/45 bg-warning/10 text-warning"
                  : "border-info/40 bg-info/10 text-foreground",
              )}
            >
              {walkInPreview.willDelaySubsequent ? (
                <span className="font-medium">تأخير متوقع ~{walkInPreview.expectedDelayMinutes} د</span>
              ) : walkInPreview.expectedDelayMinutes === 0 ? (
                <span>يدخل مباشرة في الطابور.</span>
              ) : (
                <span>يدخل بعد ~{walkInPreview.expectedDelayMinutes} د</span>
              )}
            </div>
          ) : null}
          {isCompact && walkInRecognized ? (
            <p className="rounded-md border border-success/35 bg-success/10 px-cg-2 py-cg-1.5 text-ds-label font-medium text-success">
              تم التعرف: {walkInRecognized.display_name ?? "مريض"} — جاهز لإضافة الموعد.
            </p>
          ) : null}
        </div>
      </div>

      {isCompact ? (
        <div className="flex flex-col gap-cg-3 rounded-xl border border-border/60 bg-muted/15 px-cg-3 py-cg-2 text-ds-label text-muted-foreground">
          <div className="flex flex-col gap-cg-2">
            <p>للمحادثات والردود الكاملة:</p>
            <Button variant="outline" size="sm" className="w-full shrink-0" asChild>
              <Link href="/inbox">فتح الصندوق</Link>
            </Button>
          </div>
          {peek ? (
            <div className="border-t border-border/40 pt-cg-2">
              <p className="mb-cg-1 font-medium text-foreground">رد سريع للمحادثة الأولى</p>
              <p className="mb-cg-2 line-clamp-1 text-ds-small opacity-90">{peek.display_name ?? peek.chat_id}</p>
              <div className="flex flex-wrap gap-cg-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="text-ds-label"
                  disabled={replyBusy || hardOperationalLock}
                  onClick={() => void sendQuickChip("تم", "تم، شكرًا لكم.")}
                >
                  تم
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="text-ds-label"
                  disabled={replyBusy || hardOperationalLock}
                  onClick={() => void sendQuickChip("تأخير", "نعتذر عن التأخير، نراكم قريبًا.")}
                >
                  تأخير
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="text-ds-label"
                  disabled={replyBusy || hardOperationalLock}
                  onClick={() => void sendQuickChip("تعال الآن", "تفضل الآن عند الاستقبال.")}
                >
                  تعال الآن
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isCompact ? (
      <div className="rounded-2xl border border-border/70 bg-background/80 p-cg-3">
        <div className="flex items-center justify-between gap-cg-2">
          <p className="text-ds-small font-semibold">لمحة الصندوق</p>
          {peek?.last_inbound_is_urgent ? <Badge variant="danger">عاجل</Badge> : null}
        </div>
        {peek ? (
          <>
            <p className="mt-cg-2 truncate font-medium">{peek.display_name ?? peek.chat_id}</p>
            <p className="mt-cg-1 line-clamp-2 text-ds-small text-muted-foreground">{peek.last_message ?? "—"}</p>
            <div className="mt-cg-3 flex flex-wrap gap-cg-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/inbox/${peek.conversation_id}`}>فتح كامل</Link>
              </Button>
            </div>
            <Textarea
              className="mt-cg-2 min-h-[72px]"
              placeholder="رد سريع..."
              value={quickReply}
              onChange={(e) => setQuickReply(e.target.value)}
            />
            <Button type="button" size="sm" className="mt-cg-2 w-full" disabled={replyBusy} onClick={() => void sendPeekReply()}>
              {replyBusy ? "جارٍ الإرسال..." : "إرسال رد سريع"}
            </Button>
          </>
        ) : (
          <p className="mt-cg-2 text-ds-body text-muted-foreground">لا توجد محادثات.</p>
        )}
      </div>
      ) : null}

      {!isCompact ? (
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-cg-3">
        <p className="text-ds-small font-semibold">اختصارات تشغيلية</p>
        <div className="mt-cg-3 flex flex-col gap-cg-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!next?.patient_id}
            onClick={async () => {
              const pid = next?.patient_id;
              if (!pid) return;
              await sendOperationalToPatient(
                pid,
                reminderBeforeAppointmentText({ etaMinutes: etaMinutesFor(next?.id ?? null) }),
                "التذكير",
                { type: "reminder", appointmentId: next?.id ?? null },
              );
            }}
          >
            إرسال تذكير للموعد التالي
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!todayTimeline.next?.patient_id && !todayTimeline.serveNext?.patient_id}
            onClick={async () => {
              const target = todayTimeline.next ?? todayTimeline.serveNext ?? null;
              const pid = target?.patient_id ?? null;
              if (!pid) return;
              await sendOperationalToPatient(
                pid,
                delayAlertOperationalText({ etaMinutes: etaMinutesFor(target?.id ?? null) }),
                "تنبيه التأخير",
                { type: "delay", appointmentId: target?.id ?? null },
              );
            }}
          >
            إرسال تنبيه تأخير
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!next?.patient_id}
            onClick={() => {
              const pid = next?.patient_id;
              if (!pid) return;
              void openPatientConversationWithDraft(
                pid,
                reminderBeforeAppointmentText({ etaMinutes: etaMinutesFor(next?.id ?? null) }),
              );
            }}
          >
            فتح مسودة تذكير
          </Button>
        </div>
      </div>
      ) : null}
    </WorkspacePanel>
  );
}
