import { NurseDashboard } from "@/features/dashboard/nurse-dashboard";
import {
  fetchClinicSettings,
  fetchDoctorsRows,
  fetchInboxRows,
  fetchPatientsRows,
  fetchProductMetrics,
  fetchUpcomingAppointments,
} from "@/lib/ops-server";
import { safePercent } from "@/lib/format";
import { getPlatformActingClinicId, getServerClinicIdOrThrow, getServerSession } from "@/lib/serverSession";

export default async function DashboardPage() {
  const session = await getServerSession();
  const isPlatformSuperAdmin = String(session?.role || "").toLowerCase() === "super_admin" && session?.scope === "platform";
  const actingClinicId = await getPlatformActingClinicId();
  if (isPlatformSuperAdmin && !actingClinicId) {
    return (
      <div className="rounded-2xl border border-border bg-card p-cg-5">
        <p className="text-ds-body text-muted-foreground">وضع المنصة</p>
        <h1 className="mt-cg-2 text-ds-h1 font-semibold tracking-tight">اختر عيادة من Platform Switcher</h1>
        <p className="mt-cg-2 text-ds-body text-muted-foreground">
          للوصول إلى Inbox / Patients / Appointments وغيرها، اختر العيادة المستهدفة من الشريط العلوي.
        </p>
      </div>
    );
  }
  const clinicId = await getServerClinicIdOrThrow();
  const [inboxData, patientsData, appointmentsData, doctorsData, clinicSettings, metricsData] = await Promise.all([
    fetchInboxRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchPatientsRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchUpcomingAppointments(clinicId, 30).catch(() => ({ ok: false as const, rows: [] })),
    fetchDoctorsRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchClinicSettings(clinicId).catch(() => ({ ok: false as const })),
    fetchProductMetrics().catch(() => ({ ok: false as const, data: {} })),
  ]);

  const inboxRows = inboxData.ok ? (inboxData.rows ?? []) : [];
  const patientRows = patientsData.ok ? (patientsData.rows ?? []) : [];
  const appointments = appointmentsData.ok ? (appointmentsData.rows ?? []) : [];
  const doctors = doctorsData.ok ? (doctorsData.rows ?? []) : [];
  const clinicTimezone =
    clinicSettings && (clinicSettings as { ok?: boolean; clinic?: { timezone?: string } }).ok
      ? String(((clinicSettings as { clinic?: { timezone?: string } }).clinic?.timezone ?? "") || "UTC")
      : "UTC";
  const product = metricsData.ok
    ? ((metricsData.data as { product?: Record<string, unknown> })?.product ?? {})
    : {};
  const aiHandled = Number(product.ai_auto_replies ?? 0);
  const inboundTotal = Number(product.inbound_total ?? 0);
  const aiAutomationPct =
    metricsData.ok && inboundTotal > 0 ? safePercent(aiHandled, inboundTotal) : metricsData.ok ? 0 : null;

  return (
    <NurseDashboard
      appointments={appointments}
      inboxRows={inboxRows}
      doctors={doctors}
      patients={patientRows}
      clinicTimezone={clinicTimezone}
      aiAutomationPct={aiAutomationPct}
    />
  );
}
