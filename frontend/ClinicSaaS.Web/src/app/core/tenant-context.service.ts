import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export type TenantCurrent = {
  id: string;
  name: string;
  timeZoneId: string;
};

@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly http = inject(HttpClient);
  readonly tenant = signal<TenantCurrent | null>(null);

  refresh(): Observable<TenantCurrent> {
    return this.http.get<TenantCurrent>('/api/tenant/current').pipe(
      tap({
        next: (t) => this.tenant.set(t),
        error: () => this.tenant.set(null),
      })
    );
  }
}
