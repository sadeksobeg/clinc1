import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../core/i18n.service';
import { McPanelComponent } from '../../core/mc-panel.component';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-doctor-billing',
  standalone: true,
  imports: [CommonModule, FormsModule, McPanelComponent],
  template: `
    <section class="ui-shell page-enter mc-surface">
      <div class="mc-shell">
        <div class="mc-hero mc-enter">
          <div class="mc-hero-grid">
            <div>
              <div class="mc-eyebrow mc-text-micro">Billing Control</div>
              <h1 class="mt-2 mc-text-h1 text-slate-50">{{ i18n.t('doctorBillingTitle') }}</h1>
              <p class="mc-caption mc-text-body">{{ i18n.t('doctorBillingSubtitle') }}</p>
            </div>
            <div class="grid gap-1">
              <div class="mc-text-small text-slate-400">{{ i18n.t('currentPlanHint') }}</div>
              <div class="mc-text-h3 text-emerald-200">{{ currentSubscription()?.planName || '—' }}</div>
              <div class="mc-text-micro text-slate-500">{{ canCreateRequest() ? i18n.t('canCreateRequestNow') : i18n.t('requestLockedByPending') }}</div>
            </div>
            <div class="inline-flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
              <button class="rounded-lg px-3 py-1" [class.bg-blue-600]="cycle() === 'Monthly'" (click)="cycle.set('Monthly')">{{ i18n.t('monthly') }}</button>
              <button class="rounded-lg px-3 py-1" [class.bg-blue-600]="cycle() === 'Annual'" (click)="cycle.set('Annual')">{{ i18n.t('annual') }}</button>
            </div>
          </div>
        </div>

        <div class="mc-stack-panel grid gap-6 lg:grid-cols-3">
          <div class="lg:col-span-2 space-y-6">
            <mc-panel [title]="i18n.t('choosePlan')">
              <div class="grid gap-4 md:grid-cols-2">
                @for (p of plans(); track p.id) {
                  <div class="rounded-2xl border p-4 transition-all duration-200" [class]="selectedPlanId() === p.id ? 'border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-500/10' : 'border-white/10 bg-black/20 hover:border-blue-400/30'">
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-sm font-semibold">{{ p.name }}</div>
                    </div>
                    <div class="mt-1 text-xl font-bold">USD {{ cycle() === 'Annual' ? (p.priceYearly ?? (p.priceMonthly * 12)) : p.priceMonthly }}</div>
                    <div class="text-xs text-slate-400">/{{ cycle() === 'Annual' ? i18n.t('annual') : i18n.t('monthly') }}</div>
                    <div class="mt-3 text-xs text-slate-400">
                      {{ i18n.t('appointmentsUsage') }} {{ p.maxAppointmentsPerMonth }} · {{ i18n.t('conversationsUsage') }} {{ p.maxMessages }} · {{ i18n.t('doctors') }} {{ p.maxDoctors }}
                    </div>
                    <button type="button" class="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/15" [disabled]="!canCreateRequest()" (click)="selectedPlanId.set(p.id)">
                      {{ selectedPlanId() === p.id ? i18n.t('selectedPlan') : i18n.t('selectPlanCta') }}
                    </button>
                  </div>
                }
              </div>
            </mc-panel>

            <mc-panel [title]="i18n.t('subscriptionRequest')">
              <p class="text-xs text-slate-400">{{ i18n.t('activationSlaHint') }}</p>
              <div class="mt-3 grid gap-3 md:grid-cols-2">
                <input class="ui-input" [(ngModel)]="doctorName" [placeholder]="i18n.t('doctorName')" />
                <input class="ui-input" [(ngModel)]="doctorEmail" [placeholder]="i18n.t('doctorEmail')" />
                <input class="ui-input" [(ngModel)]="phone" [placeholder]="i18n.t('phone')" />
                <select class="ui-input" [(ngModel)]="paymentMethod">
                  <option value="">{{ i18n.t('paymentMethod') }}</option>
                  <option value="Cash">{{ i18n.t('paymentCash') }}</option>
                  <option value="ShamCash">{{ i18n.t('paymentShamCash') }}</option>
                </select>
                <input class="ui-input md:col-span-2" [(ngModel)]="paymentReference" [placeholder]="i18n.t('paymentReference')" />
              </div>
              <button class="ui-button ui-button-primary mt-3" type="button" [disabled]="!canCreateRequest()" (click)="submit()">
                {{ canCreateRequest() ? i18n.t('submitRequest') : i18n.t('requestLockedByPending') }}
              </button>
            </mc-panel>
          </div>

          <div class="space-y-6">
            <mc-panel [title]="i18n.t('plan') + ' ' + i18n.t('status')">
              <div class="text-xs text-slate-300">{{ currentSubscription()?.planName || '—' }}</div>
              <div class="mt-2 grid gap-2 text-xs">
                <div class="flex justify-between"><span>Status</span><span>{{ currentSubscription()?.status || '—' }}</span></div>
                <div class="flex justify-between"><span>Remaining days</span><span>{{ currentSubscription()?.remainingDays ?? '—' }}</span></div>
                <div class="flex justify-between"><span>{{ i18n.t('doctors') }}</span><span>{{ usageDoctorsUsed() }}/{{ usageDoctorsLimit() }}</span></div>
                <div class="flex justify-between"><span>{{ i18n.t('conversationsUsage') }}</span><span>{{ usageMessagesUsed() }}/{{ usageMessagesLimit() }}</span></div>
                <div class="flex justify-between"><span>Forecast appointments</span><span>{{ usageForecastAppointments() }}</span></div>
                <div class="flex justify-between"><span>Doctors policy</span><span>{{ usageDoctorsPolicyMode() }}</span></div>
              </div>
            </mc-panel>
          </div>
        </div>

        <div class="mc-stack-panel">
          <mc-panel [title]="i18n.t('subscriptionRequestsQueue')">
            <div class="grid gap-2 text-xs">
              @for (r of invoices(); track r.id) {
                <div class="rounded-xl border border-white/10 bg-black/20 p-3 text-left">
                  <div class="font-medium">{{ r.invoiceNumber }} · USD {{ r.amount }}</div>
                  <div class="mt-1 text-slate-400">{{ r.status }} · {{ r.paymentMethod }}</div>
                  <div class="mt-1 text-slate-400">{{ toDate(r.issuedAtUtc) }}</div>
                </div>
              } @empty {
                <div class="text-slate-400">{{ i18n.t('noSubscriptionRequests') }}</div>
              }
            </div>
          </mc-panel>
        </div>
      </div>
    </section>
  `,
})
export class DoctorBillingComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  cycle = signal<'Monthly' | 'Annual'>('Monthly');
  plans = signal<PlanDto[]>([]);
  selectedPlanId = signal('');
  currentSubscription = signal<TenantSubscriptionDto | null>(null);
  usage = signal<TenantUsageDto | null>(null);
  invoices = signal<TenantInvoiceDto[]>([]);

  doctorName = '';
  doctorEmail = '';
  phone = '';
  paymentMethod = '';
  paymentReference = '';

  canCreateRequest = computed(() => {
    const status = this.currentSubscription()?.status ?? '';
    return status !== 'AwaitingPayment' && status !== 'Requested' && status !== 'PaymentConfirmed';
  });
  usageDoctorsUsed = computed(() => this.usage()?.doctors?.used ?? 0);
  usageDoctorsLimit = computed(() => this.usage()?.doctors?.limit ?? 0);
  usageMessagesUsed = computed(() => this.usage()?.messages?.used ?? 0);
  usageMessagesLimit = computed(() => this.usage()?.messages?.limit ?? 0);
  usageForecastAppointments = computed(() => this.usage()?.forecast?.appointmentsProjected ?? 0);
  usageDoctorsPolicyMode = computed(() => this.usage()?.policy?.doctorsMode ?? 'soft_limit');

  ngOnInit(): void {
    this.http.get<PlanDto[]>('/api/tenant/subscription/plans').subscribe({
      next: (x) => {
        this.plans.set(x ?? []);
        this.selectedPlanId.set(x?.[0]?.id ?? '');
      },
    });
    this.refreshTenantState();
  }

  refreshTenantState(): void {
    this.http.get<TenantSubscriptionDto>('/api/tenant/subscription').subscribe({ next: (x) => this.currentSubscription.set(x) });
    this.http.get<TenantUsageDto>('/api/tenant/subscription/usage').subscribe({ next: (x) => this.usage.set(x) });
    this.http.get<TenantInvoiceDto[]>('/api/tenant/subscription/invoices').subscribe({ next: (x) => this.invoices.set(x ?? []) });
  }

  submit(): void {
    const planId = this.selectedPlanId();
    if (!planId) return;
    if (!this.canCreateRequest()) {
      this.toast.show(this.i18n.t('pendingRequestExists'), 'error');
      return;
    }
    if (!this.doctorName.trim() || !this.doctorEmail.trim()) {
      this.toast.show(this.i18n.t('doctorNameEmailRequired'), 'error');
      return;
    }
    if (this.paymentMethod !== 'Cash' && this.paymentMethod !== 'ShamCash') {
      this.toast.show(this.i18n.t('paymentMethodRequired'), 'error');
      return;
    }
    this.http
      .post<TenantSubscriptionDto>('/api/tenant/subscription/request', {
        planId,
        billingCycle: this.cycle(),
        paymentMethod: this.paymentMethod,
        paymentReference: this.paymentReference.trim() || null,
      })
      .subscribe({
        next: () => {
          this.toast.show(this.i18n.t('subscriptionRequestSent'), 'success');
          this.refreshTenantState();
        },
        error: (e) => this.toast.show(typeof e?.error === 'string' ? e.error : this.i18n.t('requestFailed'), 'error'),
      });
  }

  toDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}

type PlanDto = {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly?: number | null;
  currency: string;
  featuresJson: string;
  maxDoctors: number;
  maxReceptionists: number;
  maxAppointmentsPerMonth: number;
  maxMessages: number;
};
type TenantSubscriptionDto = {
  id: string;
  tenantId: string;
  planId: string;
  planName: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  trialEndsAt?: string | null;
  isTrial: boolean;
  remainingDays: number;
};
type TenantUsageDto = {
  doctors: { used: number; limit: number; percentUsed: number; limitReached: boolean };
  receptionists: { used: number; limit: number; percentUsed: number; limitReached: boolean };
  appointments: { used: number; limit: number; percentUsed: number; limitReached: boolean };
  messages: { used: number; limit: number; percentUsed: number; limitReached: boolean };
  forecast?: { doctorsProjected: number; receptionistsProjected: number; appointmentsProjected: number; messagesProjected: number };
  policy?: { doctorsMode: string; doctorsBlocked: boolean; doctorsOverageUnits: number; appointmentsMode: string; appointmentsBlocked: boolean; appointmentsOverageUnits: number };
};
type TenantInvoiceDto = {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  issuedAtUtc: string;
  dueDateUtc: string;
  paidAtUtc?: string | null;
  paymentMethod: string;
  paymentReference?: string | null;
};
