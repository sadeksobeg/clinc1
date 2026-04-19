import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { I18nService } from '../../core/i18n.service';
import { ToastService } from '../../core/toast.service';

type TenantListItem = {
  id: string;
  name: string;
  subscriptionChannel: string;
  subscriptionCycle: string;
  subscriptionStatus: string;
  subscriptionPlan: string;
  addonRevenueUsd: number;
  overageRevenueUsd: number;
  doctorsCount: number;
  todayAppointmentsCount: number;
};
type SubscriptionRequestQueueItem = {
  id: string;
  clinicName: string;
  requestedByDoctorName: string;
  requestedByDoctorEmail: string;
  channel: string;
  cycle: string;
  planTier: string;
  finalPriceUsd: number;
  paymentMethod?: string | null;
  paymentReference: string;
  requestedAddonsJson: string;
  status: string;
};

@Component({
  selector: 'app-admin-clinics',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-6xl px-6 py-8">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">{{ i18n.t('clinics') }}</h1>
          <p class="mt-1 text-sm text-slate-300">
            {{ i18n.t('selectingTenant') }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          (click)="load()"
          [disabled]="loading()"
        >
          {{ i18n.t('refresh') }}
        </button>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div class="text-sm font-semibold">{{ i18n.t('createClinic') }}</div>
          <div class="mt-3 grid gap-2">
            <input class="ui-input" [(ngModel)]="createModel.name" [placeholder]="i18n.t('clinicName')" />
            <input class="ui-input" [(ngModel)]="createModel.timeZoneId" [placeholder]="i18n.t('timeZoneIana')" />
            <div class="grid grid-cols-2 gap-2">
              <select class="ui-input" [(ngModel)]="createModel.planTier">
                <option value="Starter">Starter</option>
                <option value="Growth">Growth</option>
                <option value="Pro">Pro</option>
              </select>
              <select class="ui-input" [(ngModel)]="createModel.channel">
                <option value="WhatsApp">WhatsApp</option>
                <option value="Telegram">Telegram</option>
              </select>
              <select class="ui-input" [(ngModel)]="createModel.cycle">
                <option value="Monthly">{{ i18n.t('monthly') }}</option>
                <option value="Annual">{{ i18n.t('annual') }}</option>
              </select>
            </div>
            <button class="ui-button ui-button-primary" type="button" (click)="createTenant()">{{ i18n.t('createClinic') }}</button>
          </div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div class="text-sm font-semibold">{{ i18n.t('subscriptionRequestsQueue') }}</div>
          <div class="mt-3 grid max-h-72 gap-2 overflow-auto">
            @for (r of requests(); track r.id) {
              <div class="rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                <div class="font-medium">{{ r.clinicName }} - {{ r.planTier }} - {{ r.channel }}/{{ r.cycle }} - USD {{ r.finalPriceUsd }}</div>
                <div class="mt-1 text-slate-400">{{ r.requestedByDoctorName }} | {{ r.requestedByDoctorEmail }}</div>
                <div class="mt-1 text-slate-400">{{ i18n.t('paymentMethod') }}: {{ r.paymentMethod || '—' }}</div>
                <div class="mt-1 text-slate-400">Payment Ref: {{ r.paymentReference || '—' }}</div>
                <div class="mt-1 text-slate-400">{{ r.requestedAddonsJson }}</div>
                <div class="mt-2">
                  <a routerLink="/platform/subscriptions" class="ui-button ui-button-secondary inline-flex items-center h-8 px-3">
                    {{ i18n.t('openSubscriptionRequestsPage') }}
                  </a>
                </div>
              </div>
            } @empty {
              <div class="text-xs text-slate-400">{{ i18n.t('noSubscriptionRequests') }}</div>
            }
          </div>
        </div>
      </div>
      @if (loading()) {
        <div class="mt-6 grid gap-4 md:grid-cols-2">
          @for (_ of [1, 2, 3, 4]; track _) {
            <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div class="h-4 w-2/3 animate-pulse rounded bg-white/10"></div>
              <div class="mt-3 h-3 w-1/3 animate-pulse rounded bg-white/10"></div>
              <div class="mt-5 h-9 w-28 animate-pulse rounded-xl bg-white/10"></div>
            </div>
          }
        </div>
      } @else {
        @if (error()) {
          <div class="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            {{ error() }}
          </div>
        }

        <div class="mt-6 grid gap-4 md:grid-cols-2">
          @for (t of tenants(); track t.id) {
            <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-lg font-semibold">{{ t.name }}</div>
                  <div class="mt-1 text-xs text-slate-300">
                    {{ t.id }} · {{ t.subscriptionPlan }} · {{ t.subscriptionChannel }}/{{ t.subscriptionCycle }} · {{ t.subscriptionStatus }}
                  </div>
                  <div class="mt-1 text-[11px] text-slate-400">Add-ons USD {{ t.addonRevenueUsd }} · Overage USD {{ t.overageRevenueUsd }}</div>
                </div>
                <button
                  type="button"
                  class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                  (click)="enter(t.id)"
                >
                  {{ i18n.t('enter') }}
                </button>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div class="text-[11px] uppercase tracking-wide text-slate-400">{{ i18n.t('doctors') }}</div>
                  <div class="mt-1 text-xl font-semibold">{{ t.doctorsCount }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div class="text-[11px] uppercase tracking-wide text-slate-400">{{ i18n.t('todayAppointments') }}</div>
                  <div class="mt-1 text-xl font-semibold">{{ t.todayAppointmentsCount }}</div>
                </div>
              </div>
            </div>
          } @empty {
            <div class="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200">
              {{ i18n.t('noClinics') }}
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AdminClinicsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  loading = signal(false);
  error = signal<string | null>(null);
  tenants = signal<TenantListItem[]>([]);
  requests = signal<SubscriptionRequestQueueItem[]>([]);
  createModel = { name: '', timeZoneId: 'Asia/Baghdad', planTier: 'Pro', channel: 'WhatsApp', cycle: 'Monthly' };

  ngOnInit(): void {
    void this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<TenantListItem[]>('/api/platform/clinics').subscribe({
      next: (items) => {
        this.tenants.set(items);
        this.http.get<SubscriptionRequestQueueItem[]>('/api/platform/subscriptions').subscribe({
          next: (r) => this.requests.set(r.filter((x) => x.status === 'Requested' || x.status === 'AwaitingPayment')),
        });
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.error ?? 'Could not load clinics. Are you logged in as PlatformAdmin?');
      },
    });
  }

  enter(tenantId: string): void {
    // Keep the existing tenant key used by AuthInterceptor.
    localStorage.setItem('clinicSaaS_tenant_id', tenantId);
    this.toast.show('Tenant selected.', 'success');
    // Platform admin can now operate like other roles with X-Tenant-Id.
    void this.router.navigate(['/clinic/reception']);
  }

  createTenant(): void {
    if (!this.createModel.name.trim()) return;
    this.http
      .post('/api/platform/clinics', {
        name: this.createModel.name.trim(),
        country: '',
        timeZoneId: this.createModel.timeZoneId.trim(),
        subscriptionPlan: this.createModel.planTier,
        channel: this.createModel.channel,
        cycle: this.createModel.cycle,
      })
      .subscribe({
        next: () => {
          this.toast.show(this.i18n.t('clinicCreated'), 'success');
          this.createModel.name = '';
          this.load();
        },
      });
  }

  // Review actions are centralized in /platform/subscriptions for better workflow clarity.
}

