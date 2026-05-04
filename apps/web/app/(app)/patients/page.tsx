import { PatientsTable } from "@/features/patients/patients-table";
import { fetchPatientsRows } from "@/lib/ops-server";
import { getServerClinicIdOrThrow } from "@/lib/serverSession";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function PatientsPage() {
  const clinicId = await getServerClinicIdOrThrow();
  const patientsData = await fetchPatientsRows(clinicId).catch(() => ({ ok: false as const, rows: [] }));
  const rows = patientsData.ok ? (patientsData.rows ?? []) : [];

  return (
    <div className="flex flex-col gap-cg-5">
      <PageHeader title="ملف المرضى" subtitle="إدارة علاقات المرضى للعمليات الطبية" />
      <PatientsTable rows={rows} />
    </div>
  );
}
