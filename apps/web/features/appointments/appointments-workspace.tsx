"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentsBoard } from "@/features/appointments/appointments-board";
import { NurseCommandCenter } from "@/features/operations/nurse-command-center";
import type { AppointmentRow, DoctorRow, InboxRow, PatientRow } from "@/lib/ops-server";

type Props = {
  rows: AppointmentRow[];
  doctors: DoctorRow[];
  patients: PatientRow[];
  inboxRows: InboxRow[];
  clinicTimezone: string;
  clinicWorkingHours: unknown[];
  initialPatientId?: string;
  initialDoctorId?: string;
};

export function AppointmentsWorkspace({
  rows,
  doctors,
  patients,
  inboxRows,
  clinicTimezone,
  clinicWorkingHours,
  initialPatientId,
  initialDoctorId,
}: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [tab, setTab] = useState<"ops" | "plan">(() =>
    searchParams.get("view") === "plan" ? "plan" : "ops",
  );

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "plan" || v === "ops") setTab(v);
  }, [searchParams]);

  const onTabChange = (v: string) => {
    const next = v === "plan" ? "plan" : "ops";
    setTab(next);
    const q = new URLSearchParams(searchParams.toString());
    q.set("view", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col gap-cg-2">
      <TabsList className="h-8 w-fit shrink-0 gap-0.5 rounded-lg bg-muted/70 p-0.5 text-ds-label">
        <TabsTrigger value="ops" className="rounded-md px-3 py-1.5 text-ds-label">
          تشغيل
        </TabsTrigger>
        <TabsTrigger value="plan" className="rounded-md px-3 py-1.5 text-ds-label">
          تخطيط
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="ops"
        forceMount
        className="mt-0 min-h-0 flex-1 overflow-hidden focus-visible:outline-none data-[state=inactive]:hidden"
      >
        <NurseCommandCenter
          rows={rows}
          doctors={doctors}
          patients={patients}
          inboxRows={inboxRows}
          clinicTimezone={clinicTimezone}
          clinicWorkingHours={clinicWorkingHours}
        />
      </TabsContent>
      <TabsContent
        value="plan"
        forceMount
        className="mt-0 min-h-0 flex-1 overflow-hidden focus-visible:outline-none data-[state=inactive]:hidden"
      >
        <AppointmentsBoard
          rows={rows}
          doctors={doctors}
          patients={patients}
          clinicTimezone={clinicTimezone}
          clinicWorkingHours={clinicWorkingHours}
          initialPatientId={initialPatientId}
          initialDoctorId={initialDoctorId}
        />
      </TabsContent>
    </Tabs>
  );
}
