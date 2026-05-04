"use client";

import { useMemo, useState } from "react";
import { useClinicDayOperations } from "@/features/appointments/use-clinic-day-operations";
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import type { AppointmentRow, DoctorRow, InboxRow, PatientRow } from "@/lib/ops-server";
import { ActivePatientContextPanel } from "@/features/operations/active-patient-context-panel";
import { ClinicOperationalTimeline } from "@/features/operations/clinic-operational-timeline";
import { NurseActionPanel } from "@/features/operations/nurse-action-panel";
import { NurseControlStrip } from "@/features/operations/nurse-control-strip";
import { ClinicSystemStatusBar } from "@/features/operations/clinic-system-status-bar";
import { NurseDecisionStrip } from "@/features/operations/nurse-decision-strip";
import { NurseQueueColumn } from "@/features/operations/nurse-queue-column";

type Props = {
  rows: AppointmentRow[];
  doctors: DoctorRow[];
  patients: PatientRow[];
  inboxRows: InboxRow[];
  clinicTimezone: string;
  clinicWorkingHours: unknown[];
};

export function NurseCommandCenter({ rows, doctors, patients, inboxRows, clinicTimezone, clinicWorkingHours }: Props) {
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<number | null>(null);
  const { workspaceMode, setWorkspaceMode } = useUiPreferences();

  const ops = useClinicDayOperations({
    rows,
    doctors,
    clinicTimezone,
    clinicWorkingHours,
    doctorFilter,
    patients,
    autoFocusActive: false,
  });

  const doctorFilterOptions = useMemo(() => {
    const unique = Array.from(new Set(ops.appointments.map((r) => r.doctor_name).filter(Boolean))) as string[];
    return ["all", ...unique];
  }, [ops.appointments]);

  const selectedAppointment =
    selectedAppointmentId != null ? ops.appointments.find((a) => a.id === selectedAppointmentId) ?? null : null;

  /** مع جلسة تشغيل نشطة: السياق يتبع الجلسة لا نقر الصف فقط. */
  const contextAppointment =
    ops.activeOperationalSessionAppointmentId != null
      ? ops.appointments.find((a) => a.id === ops.activeOperationalSessionAppointmentId) ?? null
      : selectedAppointment;

  const contextEnrichmentId = ops.activeOperationalSessionAppointmentId ?? selectedAppointmentId;

  const attentionAnchorActive =
    ops.activeOperationalSession != null ||
    (ops.primaryOperationalSuggestion != null && !ops.decisionDismissed);

  const showDecisionShell = !attentionAnchorActive;

  const operationalFocusId =
    ops.activeOperationalSessionAppointmentId ?? ops.primaryOperationalSuggestion?.appointment_id ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-cg-2 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-cg-2 lg:flex-row lg:items-stretch">
        <div className="min-w-0 shrink-0 lg:max-w-[min(42%,24rem)] lg:flex-1">
          <ClinicSystemStatusBar ops={ops} />
        </div>
        <div className="min-w-0 flex-1">
          <NurseControlStrip
            ops={ops}
            clinicTimezone={clinicTimezone}
            workspaceMode={workspaceMode}
            setWorkspaceMode={setWorkspaceMode}
            doctorFilter={doctorFilter}
            setDoctorFilter={setDoctorFilter}
            doctorFilterOptions={doctorFilterOptions}
          />
        </div>
      </div>

      {showDecisionShell ? (
        <div className="flex max-h-[min(22vh,220px)] shrink-0 flex-col overflow-hidden rounded-xl border border-border/55 bg-muted/15 p-cg-2 shadow-sm">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NurseDecisionStrip ops={ops} clinicTimezone={clinicTimezone} queueCentric />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-cg-3 overflow-hidden lg:flex-row lg:items-stretch">
        <div
          className={[
            "min-h-0 min-w-0 flex-1 overflow-hidden transition-opacity duration-200",
            attentionAnchorActive ? "opacity-[0.94] saturate-[0.92]" : "opacity-100",
          ].join(" ")}
        >
          <NurseQueueColumn
            ops={ops}
            clinicTimezone={clinicTimezone}
            workspaceMode={workspaceMode}
            presentation="list"
            selectedAppointmentId={selectedAppointmentId}
            onSelectAppointment={setSelectedAppointmentId}
            queueInteractionLocked={ops.decisionGateActive}
            operationalFocusId={operationalFocusId}
            attentionLayerMuted={attentionAnchorActive}
          />
        </div>
        <div
          className={[
            "flex min-h-0 w-full shrink-0 flex-col gap-cg-2 overflow-hidden lg:w-[min(320px,100%)] lg:max-w-[320px] transition-opacity duration-200",
            attentionAnchorActive ? "opacity-[0.94] saturate-[0.92]" : "opacity-100",
          ].join(" ")}
        >
          <div className="min-h-0 flex-1 overflow-auto">
            <ActivePatientContextPanel
              appointment={contextAppointment}
              inboxRows={inboxRows}
              clinicTimezone={clinicTimezone}
              onClear={() => setSelectedAppointmentId(null)}
              className="flex h-full min-h-0 flex-col"
              nowZoned={ops.nowZoned}
              enriched={
                contextEnrichmentId != null ? ops.enrichedProjectionById.get(contextEnrichmentId) ?? null : null
              }
              contextReadOnly={ops.decisionGateActive}
            />
          </div>
          <div className="max-h-[min(38vh,360px)] shrink-0 overflow-auto lg:max-h-none">
            <NurseActionPanel
              variant="compact"
              ops={ops}
              clinicTimezone={clinicTimezone}
              doctors={doctors}
              patients={patients}
              inboxRows={inboxRows}
              onWalkInCreated={(appointmentId) => {
                ops.setActiveOperationalSessionAppointmentId(appointmentId);
                setSelectedAppointmentId(appointmentId);
                requestAnimationFrame(() => ops.scrollToAppointment(appointmentId));
              }}
            />
          </div>
        </div>
      </div>

      <div
        className={[
          "h-[min(15vh,152px)] shrink-0 min-h-0 overflow-hidden transition-opacity duration-200",
          attentionAnchorActive ? "opacity-[0.88] saturate-[0.88]" : "opacity-100",
        ].join(" ")}
      >
        <ClinicOperationalTimeline
          className="h-full"
          variant="footer"
          ops={ops}
          clinicTimezone={clinicTimezone}
          doctorFilter={doctorFilter}
          appointmentsForFilter={ops.appointments}
          workspaceMode={workspaceMode}
          selectedAppointmentId={selectedAppointmentId}
          attentionLayerMuted={attentionAnchorActive}
        />
      </div>
    </div>
  );
}
