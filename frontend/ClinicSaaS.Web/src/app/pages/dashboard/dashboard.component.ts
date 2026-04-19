import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: ` <div class="px-6 py-8 text-sm text-slate-300">{{ i18n.t('redirecting') }}</div> `,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);

  constructor() {
    const role = this.auth.getRole();
    if (!this.auth.isAuthenticated() || !role) {
      void this.router.navigate(['/login']);
      return;
    }

    switch (role) {
      case 'PlatformAdmin':
        void this.router.navigate(['/platform/overview']);
        return;
      case 'Receptionist':
        void this.router.navigate(['/clinic/reception']);
        return;
      case 'Doctor':
        void this.router.navigate(['/clinic/doctor']);
        return;
    }
  }
}

