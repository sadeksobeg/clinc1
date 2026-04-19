import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { FrontendMetricsService } from './core/frontend-metrics.service';
import { I18nService } from './core/i18n.service';
import { NotificationCenterComponent } from './core/notification-center.component';
import { TenantContextService } from './core/tenant-context.service';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NotificationCenterComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('ClinicSaaS.Web');
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly tenantContext = inject(TenantContextService);
  protected readonly toast = inject(ToastService);
  private readonly metrics = inject(FrontendMetricsService);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  protected readonly currentUrl = signal('/');

  constructor() {
    this.metrics.init();
    effect(() => {
      const locale = this.i18n.locale();
      this.doc.documentElement.lang = locale;
      this.doc.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    });

    // Refresh tenant name for authenticated tenant-scoped roles.
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.currentUrl.set(this.router.url);
      const role = this.auth.getRole();
      if (!this.auth.isAuthenticated() || !role) {
        this.tenantContext.tenant.set(null);
        return;
      }

      if (role === 'PlatformAdmin') {
        // Platform admin tenant selection is manual via /platform/clinics.
        void this.tenantContext.refresh().subscribe({});
        return;
      }

      void this.tenantContext.refresh().subscribe({});
    });
  }

  protected dashboardLink(): string {
    const r = this.auth.getRole();
    if (r === 'PlatformAdmin') return '/platform/overview';
    if (r === 'Receptionist') return '/clinic/reception';
    if (r === 'Doctor') return '/clinic/doctor';
    return '/login';
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  toastClass(): string {
    const msg = this.toast.message();
    if (!msg) return 'border-white/10 bg-white/10 text-slate-100';
    if (msg.kind === 'success') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50';
    if (msg.kind === 'error') return 'border-red-500/30 bg-red-500/10 text-red-50';
    return 'border-white/10 bg-white/10 text-slate-100';
  }

  toggleLocale(): void {
    this.i18n.toggleLocale();
  }

  isPublicRoute(): boolean {
    const url = this.currentUrl();
    return url === '/' || url.startsWith('/features') || url.startsWith('/pricing') || url.startsWith('/demo') || url.startsWith('/contact') || url.startsWith('/login');
  }
}
