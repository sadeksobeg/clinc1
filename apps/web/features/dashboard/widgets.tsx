import Link from "next/link";
import { AlertTriangle, CalendarClock, MessageSquareText, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatArabicDate } from "@/lib/format";
import type { AppointmentRow, InboxRow, PatientRow } from "@/lib/ops-server";

type WidgetProps = {
  appointments: AppointmentRow[];
  inboxRows: InboxRow[];
  patientRows: PatientRow[];
};

export function DashboardWidgets({ appointments, inboxRows, patientRows }: WidgetProps) {
  const urgentCount = inboxRows.filter((r) => r.last_inbound_is_urgent).length;
  const openCount = inboxRows.filter((r) => r.status === "open").length;
  const unknownCount = inboxRows.filter((r) => String(r.last_decision_type || "").toLowerCase() === "unknown").length;

  return (
    <div className="grid gap-cg-5 lg:grid-cols-2">
      <Card className="glass-card">
        <CardHeader className="flex-row items-center justify-between gap-cg-0">
          <CardTitle className="text-ds-h3 font-semibold">
            <Link href="/appointments" className="hover:underline">
              جدول اليوم
            </Link>
          </CardTitle>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-3">
          {appointments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-cg-5 text-ds-body text-muted-foreground">
              لا توجد مواعيد حالياً.
            </div>
          ) : (
            appointments.slice(0, 5).map((appt) => (
              <div key={appt.id} className="flex items-center justify-between rounded-xl bg-muted/50 p-cg-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{appt.patient_display_name ?? "مريض غير معروف"}</p>
                  <p className="truncate text-ds-small text-muted-foreground">{appt.doctor_name ?? "الطبيب غير محدد"}</p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {formatArabicDate(appt.starts_at)}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex-row items-center justify-between gap-cg-0">
          <CardTitle className="text-ds-h3 font-semibold">
            <Link href="/inbox" className="hover:underline">
              صندوق الوارد
            </Link>
          </CardTitle>
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-3">
          <div className="flex flex-wrap gap-cg-2">
            <Badge variant={urgentCount ? "danger" : "outline"}>عاجلة: {urgentCount}</Badge>
            <Badge variant={openCount ? "warning" : "outline"}>مفتوحة: {openCount}</Badge>
          </div>
          {inboxRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-cg-5 text-ds-body text-muted-foreground">
              لا توجد محادثات حالياً.
            </div>
          ) : (
            inboxRows.slice(0, 5).map((thread) => (
              <Link
                key={thread.conversation_id}
                href={`/inbox/${thread.conversation_id}`}
                className="block rounded-xl border border-border/70 p-cg-3 hover:bg-muted/30"
              >
                <div className="mb-cg-1 flex items-center justify-between gap-cg-2">
                  <p className="truncate font-medium">{thread.display_name ?? thread.chat_id}</p>
                  <Badge variant={thread.status === "open" ? "success" : "outline"} className="shrink-0">
                    {thread.status}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-ds-body text-muted-foreground">{thread.last_message ?? "لا يوجد نص للرسالة"}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex-row items-center justify-between gap-cg-0">
          <CardTitle className="text-ds-h3 font-semibold">
            <Link href="/patients" className="hover:underline">
              أحدث المرضى
            </Link>
          </CardTitle>
          <UsersRound className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-3">
          {patientRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-cg-5 text-ds-body text-muted-foreground">
              لا توجد بيانات مرضى.
            </div>
          ) : (
            patientRows.slice(0, 5).map((patient) => (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}`}
                className="flex items-center justify-between rounded-xl bg-muted/40 p-cg-3 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{patient.display_name ?? patient.chat_id}</p>
                  <p className="truncate text-ds-small text-muted-foreground">{patient.phone_e164 ?? "لا يوجد رقم"}</p>
                </div>
                <Badge variant={patient.is_vip ? "warning" : "outline"} className="shrink-0">
                  {patient.is_vip ? "كبار العملاء" : patient.status}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex-row items-center justify-between gap-cg-0">
          <CardTitle className="text-ds-h3 font-semibold">تنبيهات الذكاء</CardTitle>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-3 text-ds-body text-muted-foreground">
          <p className="rounded-xl bg-warning/10 p-cg-3 text-warning">
            نوايا غير مؤكدة تحتاج مراجعة: <span className="font-semibold">{unknownCount}</span>
          </p>
          <p className="rounded-xl bg-danger/10 p-cg-3 text-danger">
            حالات عاجلة مفتوحة: <span className="font-semibold">{urgentCount}</span>
          </p>
          <p className="rounded-xl bg-muted/40 p-cg-3 text-muted-foreground">
            الهدف التشغيلي: تقليل “الردود المعلقة” وتصفير الحالات العاجلة قبل نهاية المناوبة.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
