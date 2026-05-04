import { AnalyticsCharts } from "@/features/analytics/analytics-charts";
import { DashboardWidgets } from "@/features/dashboard/widgets";
import { ExecutiveCharts } from "@/features/dashboard/executive-charts";
import { KpiCards } from "@/features/dashboard/kpi-cards";
import { OpsLogExport } from "@/features/operations/ops-log-export";
import { formatDayKeyInZone, isSameClinicDay, safePercent } from "@/lib/format";
import {
  fetchClinicSettings,
  fetchInboxRows,
  fetchPatientsRows,
  fetchProductMetrics,
  fetchUpcomingAppointments,
} from "@/lib/ops-server";
import { getServerClinicIdOrThrow } from "@/lib/serverSession";
import type { ProductMetrics } from "@/types/ops";

export default async function AnalyticsPage() {
  const clinicId = await getServerClinicIdOrThrow();
  const [appointmentsData, metricsData, clinicSettings, inboxData, patientsData] = await Promise.all([
    fetchUpcomingAppointments(clinicId, 30).catch(() => ({ ok: false as const, rows: [] })),
    fetchProductMetrics().catch(() => ({ ok: false as const, data: {} })),
    fetchClinicSettings(clinicId).catch(() => ({ ok: false as const })),
    fetchInboxRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchPatientsRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
  ]);

  const appointments = appointmentsData.ok ? (appointmentsData.rows ?? []) : [];
  const inboxRows = inboxData.ok ? (inboxData.rows ?? []) : [];
  const patientRows = patientsData.ok ? (patientsData.rows ?? []) : [];
  const clinicTimezone =
    clinicSettings && (clinicSettings as { ok?: boolean; clinic?: { timezone?: string } }).ok
      ? String(((clinicSettings as { clinic?: { timezone?: string } }).clinic?.timezone ?? "") || "UTC")
      : "UTC";
  const aiHandledRaw = metricsData.ok ? Number(((metricsData.data as { product?: Record<string, unknown> } | undefined)?.product?.ai_auto_replies ?? 0) as unknown) : null;
  const inboundRaw = metricsData.ok ? Number(((metricsData.data as { product?: Record<string, unknown> } | undefined)?.product?.inbound_total ?? 0) as unknown) : null;
  const aiRate = aiHandledRaw == null || inboundRaw == null ? null : safePercent(aiHandledRaw, inboundRaw || appointments.length || 1);

  const productMetrics = (metricsData.ok ? metricsData.data : undefined) as ProductMetrics | undefined;
  const aiHandled = metricsData.ok ? Number(productMetrics?.product?.ai_auto_replies ?? 0) : null;
  const totalMessages = metricsData.ok ? Number(productMetrics?.product?.inbound_total ?? 0) : null;
  const aiSavedHours =
    aiHandled != null && totalMessages != null && totalMessages > 0 ? Math.round(aiHandled / 12) : aiHandled != null ? 0 : null;
  const todayAppointments = appointmentsData.ok ? appointments.filter((a) => isSameClinicDay(a.starts_at, new Date(), clinicTimezone)).length : null;

  const byDay = new Map<string, number>();
  for (const item of appointments) {
    const k = formatDayKeyInZone(item.starts_at, clinicTimezone);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const dayRows = Array.from(byDay.entries())
    .map(([name, appointments]) => ({ name, appointments }))
    .slice(0, 14);

  return (
    <div className="flex flex-col gap-cg-6">
      <header className="flex flex-wrap items-end justify-between gap-cg-3">
        <div>
          <p className="text-ds-body text-muted-foreground">تحليلات البيانات للقرارات التنفيذية</p>
          <h1 className="text-ds-h1 font-semibold tracking-tight">التحليلات</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card px-cg-4 py-cg-2 text-ds-body text-muted-foreground">
          {aiRate == null ? (
            <span>مؤشرات الذكاء الاصطناعي غير متاحة حالياً.</span>
          ) : (
            <span>
              الذكاء الاصطناعي عالج <span className="font-semibold text-foreground">{aiRate}%</span> من المحادثات الواردة.
            </span>
          )}
        </div>
      </header>
      {!appointmentsData.ok || !metricsData.ok ? (
        <p className="rounded-2xl border border-border/80 bg-muted/30 px-cg-4 py-cg-3 text-ds-body text-muted-foreground">
          بعض البيانات غير متاحة الآن:{" "}
          <span className="font-medium text-foreground">
            {[!appointmentsData.ok ? "المواعيد" : null, !metricsData.ok ? "مؤشرات المنتج" : null].filter(Boolean).join("، ")}
          </span>
        </p>
      ) : null}
      <p className="rounded-2xl border border-border/80 bg-muted/30 px-cg-4 py-cg-3 text-ds-body text-muted-foreground">
        المخططات أدناه تعتمد على بيانات تشغيلية فعلية (المواعيد القادمة + مؤشرات المنتج). لا تتضمن تقارير مالية.
      </p>
      <AnalyticsCharts dayRows={dayRows} aiPercent={aiRate} />

      <section className="border-t border-border/60 pt-cg-6">
        <div className="mb-cg-4">
          <h2 className="text-ds-h2 font-semibold tracking-tight">مؤشرات وتقارير العيادة</h2>
          <p className="mt-cg-1 text-ds-body text-muted-foreground">
            نظرة تنفيذية موحّدة (كانت ضمن لوحة القيادة سابقًا). للتشغيل اللحظي استخدم{" "}
            <a href="/dashboard" className="font-medium text-primary underline underline-offset-4">
              مركز التشغيل
            </a>
            .
          </p>
        </div>

        {[!patientsData.ok ? "المرضى" : null, !inboxData.ok ? "صندوق الوارد" : null, !metricsData.ok ? "مؤشرات المنتج" : null].some(Boolean) ? (
          <div className="mb-cg-4 rounded-2xl border border-border/80 bg-muted/30 px-cg-4 py-cg-3 text-ds-body text-muted-foreground">
            بعض بيانات هذا القسم غير متاحة:{" "}
            <span className="font-medium text-foreground">
              {[(!patientsData.ok ? "المرضى" : null), (!inboxData.ok ? "صندوق الوارد" : null), (!metricsData.ok ? "مؤشرات المنتج" : null)]
                .filter(Boolean)
                .join("، ")}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-cg-6">
          <KpiCards
            metrics={{
              totalPatients: patientsData.ok ? patientRows.length : null,
              todayAppointments,
              aiSavedHours,
              pendingReplies: inboxData.ok ? inboxRows.filter((r) => r.status === "open").length : null,
              activeDoctors: appointmentsData.ok ? new Set(appointments.map((a) => a.doctor_id).filter(Boolean)).size : null,
            }}
          />
          <ExecutiveCharts rows={dayRows} />
          <DashboardWidgets appointments={appointments} inboxRows={inboxRows} patientRows={patientRows} />
          <OpsLogExport />
        </div>
      </section>
    </div>
  );
}
