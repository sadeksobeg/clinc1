import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';

export type AppointmentDto = {
  id: string;
  doctorId: string;
  patientId: string;
  visitTypeId: string;
  startTime: string;
  endTime: string;
  status: number;
  queueNumber: number;
  queueDate: string;
  tenantId: string;
};

export type DoctorDto = {
  id: string;
  name: string;
  specialty: string;
  tenantId: string;
};

export type DoctorStatusLatestDto = {
  doctorId: string;
  doctorName: string;
  status: number | null;
  delayMinutes: number | null;
  recordedAt: string | null;
};

export type VisitTypeDto = {
  id: string;
  name: string;
  durationMinutes: number;
  tenantId: string;
};

export type PatientDto = {
  id: string;
  name: string;
  phoneNumber: string;
  notes: string;
  tenantId: string;
};

export type WalkInRequest = {
  doctorId: string | null;
  visitTypeId: string;
  patientName: string;
  phoneNumber: string;
  notes: string;
  fromDateTimeUtc: string | null;
};

@Injectable({ providedIn: 'root' })
export class ReceptionApiService {
  private readonly http = inject(HttpClient);

  loadDashboard(dateIso: string): Observable<{
    appointments: AppointmentDto[];
    doctors: DoctorDto[];
    visitTypes: VisitTypeDto[];
    patients: PatientDto[];
    doctorStatuses: DoctorStatusLatestDto[];
  }> {
    const params = new HttpParams().set('date', dateIso);
    return forkJoin({
      appointments: this.http.get<AppointmentDto[]>('/api/appointments', { params }),
      doctors: this.http.get<DoctorDto[]>('/api/doctors'),
      doctorStatuses: this.http.get<DoctorStatusLatestDto[]>('/api/doctors/statuses/latest'),
      visitTypes: this.http.get<VisitTypeDto[]>('/api/visitTypes'),
      patients: this.http.get<PatientDto[]>('/api/patients'),
    });
  }

  walkIn(body: WalkInRequest): Observable<AppointmentDto> {
    return this.http.post<AppointmentDto>('/api/appointments/walk-in', body);
  }

  setDoctorDelayed(doctorId: string, delayMinutes: number): Observable<unknown> {
    return this.http.post(`/api/doctors/${doctorId}/status`, {
      status: 'Delayed',
      delayMinutes,
    });
  }

  setAppointmentStatus(appointmentId: string, status: 'Completed' | 'NoShow'): Observable<unknown> {
    return this.http.patch(`/api/appointments/${appointmentId}/status`, { status });
  }
}
