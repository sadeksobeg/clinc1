import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export type UserRole = 'Doctor' | 'Receptionist' | 'PlatformAdmin';

type LoginResponse = {
  accessToken: string;
  expiresAt: string;
};

type LoginRequest = {
  email: string;
  password: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'clinicSaaS_access_token';
  private readonly TENANT_KEY = 'clinicSaaS_tenant_id';

  constructor(private http: HttpClient) {}

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getTenantId(): string | null {
    return localStorage.getItem(this.TENANT_KEY);
  }

  getRole(): UserRole | null {
    const token = this.getToken();
    if (!token) return null;
    const payload = this.decodeJwt(token);
    const role =
      payload?.['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? payload?.role;
    if (role === 'Doctor' || role === 'Receptionist' || role === 'PlatformAdmin') {
      return role;
    }
    if (
      payload?.role === 'Doctor' ||
      payload?.role === 'Receptionist' ||
      payload?.role === 'PlatformAdmin'
    ) {
      return payload.role as UserRole;
    }
    return null;
  }

  getSubId(): string | null {
    const token = this.getToken();
    if (!token) return null;
    const payload = this.decodeJwt(token);
    const sub = payload?.sub;
    return typeof sub === 'string' ? sub : null;
  }

  getDisplayName(): string | null {
    const token = this.getToken();
    if (!token) return null;
    const payload = this.decodeJwt(token);
    const name =
      payload?.name ??
      payload?.unique_name ??
      payload?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ??
      payload?.email;
    return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    const payload = this.decodeJwt(token);
    const exp = payload?.exp;
    if (!exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return exp > now;
  }

  login(email: string, password: string, tenantId: string): Observable<LoginResponse> {
    localStorage.setItem(this.TENANT_KEY, tenantId);

    const body: LoginRequest = { email, password };
    return this.http.post<LoginResponse>('/api/auth/login', body).pipe(
      tap((res) => {
        localStorage.setItem(this.TOKEN_KEY, res.accessToken);
        const payload = this.decodeJwt(res.accessToken);
        const role = this.getRoleFromPayload(payload);
        if (role !== 'PlatformAdmin' && payload?.tenant_id) {
          localStorage.setItem(this.TENANT_KEY, payload.tenant_id);
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
  }

  private getRoleFromPayload(payload: Record<string, unknown> | null): UserRole | null {
    if (!payload) return null;
    const role =
      (payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] as string) ??
      (payload['role'] as string);
    if (role === 'Doctor' || role === 'Receptionist' || role === 'PlatformAdmin') {
      return role;
    }
    return null;
  }

  private decodeJwt(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return {};
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return {};
    }
  }
}
