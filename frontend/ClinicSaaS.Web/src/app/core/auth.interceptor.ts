import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<any> {
    const token = this.auth.getToken();
    const tenantId = this.auth.getTenantId();

    let headers = req.headers;

    if (tenantId && !headers.has('X-Tenant-Id')) {
      headers = headers.set('X-Tenant-Id', tenantId);
    }

    if (token && !headers.has('Authorization')) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    const cloned = req.clone({ headers });
    return next.handle(cloned);
  }
}

