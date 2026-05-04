import { NurseCommandCenter } from "@/features/operations/nurse-command-center";
import {
  fetchClinicSettings,
  fetchDoctorsRows,
  fetchInboxRows,
  fetchPatientsRows,
  fetchUpcomingAppointments,
} from "@/lib/ops-server";
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
  const [inboxData, patientsData, appointmentsData, doctorsData, clinicSettings] = await Promise.all([
    fetchInboxRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchPatientsRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchUpcomingAppointments(clinicId, 30).catch(() => ({ ok: false as const, rows: [] })),
    fetchDoctorsRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchClinicSettings(clinicId).catch(() => ({ ok: false as const })),
  ]);

  const inboxRows = inboxData.ok ? (inboxData.rows ?? []) : [];
  const patientRows = patientsData.ok ? (patientsData.rows ?? []) : [];
  const appointments = appointmentsData.ok ? (appointmentsData.rows ?? []) : [];
  const doctors = doctorsData.ok ? (doctorsData.rows ?? []) : [];
  const clinicTimezone =
    clinicSettings && (clinicSettings as { ok?: boolean; clinic?: { timezone?: string } }).ok
      ? String(((clinicSettings as { clinic?: { timezone?: string } }).clinic?.timezone ?? "") || "UTC")
      : "UTC";
  const clinicWorkingHours = (clinicSettings as { working_hours?: unknown[] } | undefined)?.working_hours ?? [];

  const showPartialBanner = [!patientsData.ok ? "المرضى" : null, !appointmentsData.ok ? "المواعيد" : null, !inboxData.ok ? "صندوق الوارد" : null, !doctorsData.ok ? "الأطباء" : null].filter(Boolean).length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-cg-4">
      <header className="shrink-0">
        <p className="text-ds-body text-muted-foreground">مركز التشغيل اللحظي</p>
        <h1 className="text-ds-h1 font-semibold tracking-tight">لوحة الممرضة</h1>
        <p className="mt-cg-1 max-w-2xl text-ds-body text-muted-foreground">
          طابور حي، جدول اليوم، وإجراءات سريعة في شاشة واحدة. للمؤشرات التنفيذية والرسوم البيانية انتقل إلى{" "}
          <a href="/analytics" className="font-medium text-primary underline underline-offset-4">
            التحليلات
          </a>
          .
        </p>
      </header>

      {showPartialBanner ? (
        <div className="shrink-0 rounded-2xl border border-border/80 bg-muted/30 px-cg-4 py-cg-3 text-ds-body text-muted-foreground">
          بعض البيانات غير متاحة الآن:{" "}
          <span className="font-medium text-foreground">
            {[(!patientsData.ok ? "المرضى" : null), (!appointmentsData.ok ? "المواعيد" : null), (!inboxData.ok ? "صندوق الوارد" : null), (!doctorsData.ok ? "الأطباء" : null)]
              .filter(Boolean)
              .join("، ")}
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <NurseCommandCenter
          rows={appointments}
          doctors={doctors}
          patients={patientRows}
          inboxRows={inboxRows}
          clinicTimezone={clinicTimezone}
          clinicWorkingHours={clinicWorkingHours}
        />
      </div>
    </div>
  );
}
