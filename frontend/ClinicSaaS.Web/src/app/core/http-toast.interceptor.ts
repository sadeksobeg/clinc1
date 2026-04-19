import { Injectable, inject } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { I18nService } from './i18n.service';
import { ToastService } from './toast.service';

/** Surfaces API errors as toasts for mutating requests. */
@Injectable()
export class HttpToastInterceptor implements HttpInterceptor {
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const method = req.method.toUpperCase();
    const showToast = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';

    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        if (showToast) {
          const msg =
            typeof err.error?.message === 'string'
              ? err.error.message
              : err.status === 0
                ? this.i18n.t('apiUnreachable')
                : `${this.i18n.t('requestFailed')} (${err.status})`;
          this.toast.show(msg, 'error');
        }
        return throwError(() => err);
      })
    );
  }
}
