import { CalendarDays, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safePercent } from "@/lib/format";
import { fetchDoctorsRows, fetchUpcomingAppointments } from "@/lib/ops-server";
import { getServerClinicIdOrThrow } from "@/lib/serverSession";

type DoctorSummary = {
  id: number;
  name: string;
  specialty: string | null;
  bookings: number;
  uniquePatients: number;
};

export default async function DoctorsPage() {
  const clinicId = await getServerClinicIdOrThrow();
  const [appointmentsData, doctorsData] = await Promise.all([
    fetchUpcomingAppointments(clinicId, 30).catch(() => ({ ok: false as const, rows: [] })),
    fetchDoctorsRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
  ]);
  const rows = appointmentsData.ok ? (appointmentsData.rows ?? []) : [];
  const doctors = doctorsData.ok ? (doctorsData.rows ?? []) : [];

  const byDoctor = new Map<number, DoctorSummary & { patientIds: Set<number> }>();
  for (const d of doctors) {
    byDoctor.set(d.id, {
      id: d.id,
      name: d.display_name,
      specialty: d.specialty ?? null,
      bookings: 0,
      uniquePatients: 0,
      patientIds: new Set<number>(),
    });
  }

  rows.forEach((row) => {
    if (row.doctor_id == null) return;
    const id = Number(row.doctor_id);
    const prev =
      byDoctor.get(id) ??
      ({
        id,
        name: row.doctor_name ?? `Doctor #${id}`,
        specialty: null,
        bookings: 0,
        uniquePatients: 0,
        patientIds: new Set<number>(),
      } as DoctorSummary & { patientIds: Set<number> });
    prev.bookings += 1;
    if (row.patient_id != null) prev.patientIds.add(row.patient_id);
    prev.uniquePatients = prev.patientIds.size;
    byDoctor.set(id, prev);
  });

  const summary = Array.from(byDoctor.values())
    .map(({ patientIds: _p, ...d }) => d)
    .sort((a, b) => b.bookings - a.bookings);

  return (
    <div className="flex flex-col gap-cg-5">
      <header>
        <p className="text-ds-body text-muted-foreground">ملخص يعتمد على قائمة الأطباء الفعلية + المواعيد القادمة</p>
        <h1 className="text-ds-h1 font-semibold tracking-tight">الأطباء</h1>
      </header>

      <div className="grid gap-cg-4 md:grid-cols-2 xl:grid-cols-3">
        {summary.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-cg-5 text-ds-body text-muted-foreground">
            لا توجد أطباء مسجلون لهذه العيادة بعد.
          </div>
        ) : (
          summary.map((doctor) => (
            <Card key={doctor.id} className="glass-card">
            <CardHeader className="pb-cg-3">
              <CardTitle className="text-ds-h2 font-semibold">{doctor.name}</CardTitle>
              {doctor.specialty ? <p className="text-ds-small text-muted-foreground">{doctor.specialty}</p> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-cg-3 text-ds-body">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-cg-3">
                <span className="text-muted-foreground">الحجوزات (مواعيد قادمة)</span>
                <span className="font-semibold">{doctor.bookings}</span>
              </div>
              <div className="grid grid-cols-2 gap-cg-2">
                <div className="rounded-xl bg-muted/40 p-cg-3">
                  <div className="mb-cg-1 flex items-center gap-cg-1 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    مرضى (فريد)
                  </div>
                  <p className="font-semibold">{doctor.uniquePatients}</p>
                </div>
                <div className="rounded-xl bg-muted/40 p-cg-3">
                  <div className="mb-cg-1 flex items-center gap-cg-1 text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    حصة من المواعيد
                  </div>
                  <Badge variant={doctor.bookings > 0 ? "success" : "outline"}>{safePercent(doctor.bookings, rows.length || 1)}%</Badge>
                </div>
              </div>
            </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
