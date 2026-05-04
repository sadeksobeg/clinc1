import { Suspense } from "react";
import { AppointmentsWorkspace } from "@/features/appointments/appointments-workspace";
import {
  fetchClinicSettings,
  fetchDoctorsRows,
  fetchInboxRows,
  fetchPatientsRows,
  fetchUpcomingAppointments,
} from "@/lib/ops-server";
import { getServerClinicIdOrThrow } from "@/lib/serverSession";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams?: { patient_id?: string; doctor_id?: string };
}) {
  const clinicId = await getServerClinicIdOrThrow();
  const [appointmentsData, doctorsData, patientsData, inboxData, clinicSettings] = await Promise.all([
    fetchUpcomingAppointments(clinicId, 30).catch(() => ({ ok: false as const, rows: [] })),
    fetchDoctorsRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchPatientsRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchInboxRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
    fetchClinicSettings(clinicId).catch(() => ({ ok: false as const })),
  ]);
  const rows = appointmentsData.ok ? (appointmentsData.rows ?? []) : [];
  const doctors = doctorsData.ok ? (doctorsData.rows ?? []) : [];
  const patients = patientsData.ok ? (patientsData.rows ?? []) : [];
  const inboxRows = inboxData.ok ? (inboxData.rows ?? []) : [];
  const clinicTimezone =
    clinicSettings && (clinicSettings as { ok?: boolean; clinic?: { timezone?: string } }).ok
      ? String(((clinicSettings as { clinic?: { timezone?: string } }).clinic?.timezone ?? "") || "UTC")
      : "UTC";
  const clinicWorkingHours = (clinicSettings as { working_hours?: unknown[] } | undefined)?.working_hours ?? [];
  const initialPatientId = searchParams?.patient_id ? String(searchParams.patient_id) : "";
  const initialDoctorId = searchParams?.doctor_id ? String(searchParams.doctor_id) : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-cg-4">
      <div className="shrink-0">
        <PageHeader title="المواعيد" subtitle="تشغيل اليوم (افتراضي) أو تخطيط وتقويم كامل من التبويب" />
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="p-cg-4 text-ds-body text-muted-foreground">جارٍ التحميل…</div>}>
          <AppointmentsWorkspace
            rows={rows}
            doctors={doctors}
            patients={patients}
            inboxRows={inboxRows}
            clinicTimezone={clinicTimezone}
            clinicWorkingHours={clinicWorkingHours}
            initialPatientId={initialPatientId}
            initialDoctorId={initialDoctorId}
          />
        </Suspense>
      </div>
    </div>
  );
}
