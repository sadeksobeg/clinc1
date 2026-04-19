import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIf],
  template: `
    <div class="mx-auto grid max-w-5xl gap-5 px-6 py-10 md:grid-cols-2">
      <div class="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h1 class="text-2xl font-semibold tracking-tight">{{ i18n.t('signIn') }}</h1>
        <p class="mt-2 text-sm text-slate-300">
          {{ i18n.t('tenantIsolationHint') }}
        </p>

        <form class="mt-6 grid gap-3" (ngSubmit)="submit()">
          <label class="grid gap-1 text-sm text-slate-200">
            <span class="text-xs text-slate-400">{{ i18n.t('tenantId') }}</span>
            <input
              class="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-500/60"
              [(ngModel)]="tenantId"
              name="tenantId"
              required
            />
          </label>

          <label class="grid gap-1 text-sm text-slate-200">
            <span class="text-xs text-slate-400">{{ i18n.t('email') }}</span>
            <input
              class="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-500/60"
              [(ngModel)]="email"
              name="email"
              type="email"
              required
            />
          </label>

          <label class="grid gap-1 text-sm text-slate-200">
            <span class="text-xs text-slate-400">{{ i18n.t('password') }}</span>
            <input
              class="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-slate-100 outline-none focus:border-blue-500/60"
              [(ngModel)]="password"
              name="password"
              type="password"
              required
            />
          </label>

          <button
            type="submit"
            class="mt-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            {{ i18n.t('login') }}
          </button>

          <div *ngIf="error" class="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            {{ error }}
          </div>
        </form>
      </div>

      <div class="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 class="text-lg font-semibold">{{ i18n.t('devAccounts') }}</h2>
        <div class="mt-3 space-y-3 text-sm text-slate-200">
          <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div class="text-xs uppercase tracking-wide text-slate-400">{{ i18n.t('platformAdmin') }}</div>
            <div class="mt-1 font-medium">platform@acme.dev</div>
            <div class="text-xs text-slate-400">{{ i18n.t('role') }}: PlatformAdmin</div>
            <div class="mt-2 text-xs font-medium text-emerald-200/90">
              {{ i18n.locale() === 'ar' ? 'كلمة مرور التطوير (لكل المستخدمين):' : 'Dev password (all seed users):' }} <code class="rounded bg-black/30 px-1">admin12345</code>
            </div>
          </div>
          <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div class="text-xs uppercase tracking-wide text-slate-400">{{ i18n.t('tenantUsers') }}</div>
            <div class="mt-1">reception@acme.dev · doctor@acme.dev</div>
            <div class="mt-1 text-xs text-slate-400">{{ i18n.t('samePassword') }}</div>
          </div>
          <p class="text-xs text-slate-400">
            {{ i18n.t('platformAdminHint') }}
          </p>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  readonly i18n = inject(I18nService);
  tenantId = '11111111-1111-1111-1111-111111111111';
  email = '';
  password = '';

  error: string | null = null;

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    this.error = null;
    this.auth.login(this.email, this.password, this.tenantId).subscribe({
      next: () => void this.router.navigate(['/dashboard']),
      error: (e) => (this.error = this.pickError(e)),
    });
  }

  private pickError(err: any): string {
    const status = err?.status;
    if (status === 401) {
      return this.i18n.t('invalidCredentials');
    }
    if (status === 0 || err?.statusText === 'Unknown Error') {
      return this.i18n.t('apiUnreachable');
    }
    if (err?.error?.message) return err.error.message;
    if (typeof err?.message === 'string') return err.message;
    return this.i18n.t('requestFailed');
  }
}

