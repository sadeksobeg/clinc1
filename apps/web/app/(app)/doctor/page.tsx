import Link from "next/link";
import { CalendarDays, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchInboxRows, fetchUpcomingAppointments } from "@/lib/ops-server";
import { getServerClinicIdOrThrow, getServerSession } from "@/lib/serverSession";

export default async function DoctorQueuePage() {
  const session = await getServerSession();
  const clinicId = await getServerClinicIdOrThrow();
  const [appointmentsData, inboxData] = await Promise.all([
    fetchUpcomingAppointments(clinicId, 14).catch(() => ({ ok: false as const, rows: [] })),
    fetchInboxRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
  ]);

  const appointments = appointmentsData.ok ? (appointmentsData.rows ?? []) : [];
  const inboxRows = inboxData.ok ? (inboxData.rows ?? []) : [];
  const doctorName = session?.email || "طبيب";

  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter((a) => String(a.starts_at || "").startsWith(today));
  const urgentInbox = inboxRows
    .filter((r) => r.last_inbound_is_urgent || String(r.last_inbound_intent || "").toUpperCase().includes("EMERGENCY"))
    .slice(0, 8);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-cg-4">
      <PageHeader
        title="طابور الطبيب"
        subtitle={`مرحباً ${doctorName} — مواعيد اليوم والمحادثات العاجلة`}
      />

      <div className="grid gap-cg-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              مواعيد اليوم
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/appointments">الجدول الكامل</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {!appointmentsData.ok ? (
              <p className="text-sm text-destructive">تعذر تحميل المواعيد — تحقق من اتصال ops-dashboard.</p>
            ) : todayAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا مواعيد مجدولة لهذا اليوم.</p>
            ) : (
              todayAppointments.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{row.patient_display_name || "مريض"}</p>
                    <p className="text-muted-foreground">
                      {row.starts_at ? new Date(row.starts_at).toLocaleTimeString("ar") : "—"}
                      {row.doctor_name ? ` · ${row.doctor_name}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{row.status || "scheduled"}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4" />
              محادثات عاجلة
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/inbox">صندوق الوارد</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {!inboxData.ok ? (
              <p className="text-sm text-destructive">تعذر تحميل المحادثات.</p>
            ) : urgentInbox.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا محادثات عاجلة في الطابور.</p>
            ) : (
              urgentInbox.map((row) => (
                <Link
                  key={row.conversation_id}
                  href={`/inbox/${row.conversation_id}`}
                  className="block rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <p className="font-medium">{row.display_name || row.chat_id || "محادثة"}</p>
                  <p className="line-clamp-1 text-muted-foreground">{row.last_message || "—"}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
