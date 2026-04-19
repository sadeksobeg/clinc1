import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type DoctorMeDto = {
  id: string;
  name: string;
  specialty: string;
  tenantId: string;
  linkedUserId: string | null;
};

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

@Injectable({ providedIn: 'root' })
export class DoctorApiService {
  private readonly http = inject(HttpClient);

  me(): Observable<DoctorMeDto> {
    return this.http.get<DoctorMeDto>('/api/doctors/me');
  }

  appointmentsByDate(dateIso: string, doctorId: string): Observable<AppointmentDto[]> {
    const params = new HttpParams().set('date', dateIso).set('doctorId', doctorId);
    return this.http.get<AppointmentDto[]>('/api/appointments', { params });
  }

  setAppointmentStatus(appointmentId: string, status: 'Completed' | 'NoShow'): Observable<unknown> {
    return this.http.patch(`/api/appointments/${appointmentId}/status`, { status });
  }
}

