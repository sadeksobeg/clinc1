import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../core/i18n.service';
import { McActionComponent } from '../../core/mc-action.component';
import { McPanelComponent } from '../../core/mc-panel.component';

type QueueItem = {
  id: string;
  tenantId: string;
  clinicName: string;
  requestedByDoctorName: string;
  requestedByDoctorEmail: string;
  channel: string;
  cycle: string;
  planTier: string;
  requestType: string;
  changeSummary: string;
  finalPriceUsd: number;
  paymentMethod?: string | null;
  paymentReference: string;
  status: string;
  createdAtUtc: string;
  decisionReason?: string | null;
};
type RevenueKpi = { mrr: number; arr: number; arpu: number; expansionRevenue: number; churnRate: number };
type PaymentAttempt = { id: string; paymentId: string; status: string; attemptedAtUtc: string; failureReason: string };

@Component({
  selector: 'app-platform-subscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, McActionComponent, McPanelComponent],
  template: `
    <section class="mc-surface page-enter">
      <div class="mc-shell">
        <div class="mc-hero mc-enter">
          <div class="mc-hero-grid">
            <div>
              <div class="mc-eyebrow mc-text-micro">Revenue Operations</div>
              <h1 class="mt-2 mc-text-h1 text-slate-50">{{ i18n.t('subscriptionRequestsQueue') }}</h1>
              <p class="mc-caption mc-text-body">Review, approve, and activate subscription changes with full context.</p>
            </div>
            <div class="grid gap-1">
              <div class="mc-text-small text-slate-400">Open queue</div>
              <div class="mc-text-h3 text-amber-200">{{ openRequestsCount() }}</div>
            </div>
            <div class="flex items-center justify-end">
              <button class="ui-button ui-button-secondary" (click)="load()">{{ i18n.t('refresh') }}</button>
            </div>
          </div>
          <div class="mt-6 grid gap-3 md:grid-cols-4">
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">Requested</div><div class="mt-1 mc-text-h3 text-slate-100">{{ statusCount('Requested') }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">Awaiting Payment</div><div class="mt-1 mc-text-h3 text-slate-100">{{ statusCount('AwaitingPayment') }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">Payment Confirmed</div><div class="mt-1 mc-text-h3 text-slate-100">{{ statusCount('PaymentConfirmed') }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">Activated</div><div class="mt-1 mc-text-h3 text-slate-100">{{ statusCount('Activated') }}</div></div>
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-5">
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">MRR</div><div class="mt-1 mc-text-h3 text-slate-100">{{ kpis()?.mrr ?? 0 }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">ARR</div><div class="mt-1 mc-text-h3 text-slate-100">{{ kpis()?.arr ?? 0 }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">ARPU</div><div class="mt-1 mc-text-h3 text-slate-100">{{ kpis()?.arpu ?? 0 }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">Expansion</div><div class="mt-1 mc-text-h3 text-slate-100">{{ kpis()?.expansionRevenue ?? 0 }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">Churn %</div><div class="mt-1 mc-text-h3 text-slate-100">{{ kpis()?.churnRate ?? 0 }}</div></div>
          </div>
        </div>

        <div class="mc-stack-panel grid gap-6 lg:grid-cols-5">
          <mc-panel [title]="'Queue'" class="lg:col-span-2">
            <div class="mb-3 grid gap-2">
              <input class="ui-input h-9" [(ngModel)]="searchQuery" placeholder="Search clinic or doctor" />
              <select class="ui-input h-9" [(ngModel)]="statusFilter">
                <option value="all">All statuses</option>
                <option value="Requested">Requested</option>
                <option value="AwaitingPayment">AwaitingPayment</option>
                <option value="PaymentConfirmed">PaymentConfirmed</option>
                <option value="Activated">Activated</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div class="space-y-2 max-h-[38rem] overflow-auto pr-1">
              @for (r of filteredRequests(); track r.id) {
                <button
                  type="button"
                  class="w-full rounded-2xl border bg-black/20 p-3 text-left transition"
                  [class]="selectedId() === r.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/10 hover:border-blue-400/30'"
                  (click)="select(r)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-xs font-semibold text-slate-100">{{ r.clinicName }}</div>
                    <span class="ui-status" [class]="statusClass(r.status)">{{ r.status }}</span>
                  </div>
                  <div class="mt-1 text-[11px] text-slate-300">{{ r.requestedByDoctorName || '—' }}</div>
                  <div class="mt-1 text-[11px] text-slate-400">{{ r.requestType }} · {{ r.changeSummary }}</div>
                  <div class="mt-1 text-[11px] text-slate-400">USD {{ r.finalPriceUsd }} · {{ formatDate(r.createdAtUtc) }}</div>
                </button>
              } @empty {
                <div class="ui-empty">{{ i18n.t('noSubscriptionRequests') }}</div>
              }
            </div>
          </mc-panel>

          <mc-panel [title]="'Request details'" class="lg:col-span-3">
            @if (selected()) {
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="ui-section-title">{{ selected()!.clinicName }} · {{ selected()!.planTier }}</h2>
                  <p class="ui-section-subtitle">{{ selected()!.requestedByDoctorName }} · {{ selected()!.requestedByDoctorEmail }}</p>
                </div>
                <span class="ui-status" [class]="statusClass(selected()!.status)">{{ timelineLabel(selected()!.status) }}</span>
              </div>

              <div class="mt-4 grid gap-2 text-xs text-slate-300 md:grid-cols-3">
                <div class="ui-lane">Request type: {{ selected()!.requestType }}</div>
                <div class="ui-lane">Plan: {{ selected()!.planTier }} ({{ selected()!.channel }}/{{ selected()!.cycle }})</div>
                <div class="ui-lane">Amount: USD {{ selected()!.finalPriceUsd }}</div>
                <div class="ui-lane">{{ i18n.t('paymentMethod') }}: {{ selected()!.paymentMethod || '—' }}</div>
                <div class="ui-lane">Payment ref: {{ selected()!.paymentReference || '—' }}</div>
                <div class="ui-lane">Created: {{ formatDate(selected()!.createdAtUtc) }}</div>
              </div>
              <div class="mt-2 text-xs text-slate-400 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                {{ selected()!.changeSummary }}
              </div>
              @if (paymentAttempts().length) {
                <div class="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                  <div class="font-medium mb-1">Payment attempts</div>
                  @for (a of paymentAttempts(); track a.id) {
                    <div>{{ a.status }} · {{ formatDate(a.attemptedAtUtc) }} · {{ a.failureReason || 'ok' }}</div>
                  }
                </div>
              }

              @if (selected()!.status === 'Requested') {
                <div class="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div class="text-xs text-slate-300">Review and move this request to payment stage.</div>
                  <div class="mt-3 grid gap-2">
                    <input class="ui-input" [(ngModel)]="decisionReason" [placeholder]="i18n.t('notesForAdmin')" />
                  </div>
                  <div class="mt-3 flex gap-2">
                    <mc-action
                      type="approve-subscription"
                      [entity]="selected()!"
                      [payload]="{ note: decisionReason.trim() || null }"
                      [labelOverride]="i18n.t('approve')"
                      (done)="load()"
                    />
                    <mc-action
                      type="reject-subscription"
                      [entity]="selected()!"
                      [payload]="{ note: decisionReason.trim() || null }"
                      [labelOverride]="i18n.t('reject')"
                      (done)="load()"
                    />
                  </div>
                </div>
              } @else if (selected()!.status === 'AwaitingPayment') {
                <div class="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div class="text-xs text-slate-300">{{ i18n.t('activationSlaHint') }}</div>
                  <div class="mt-3 grid gap-2 md:grid-cols-2">
                    <select class="ui-input" [(ngModel)]="decisionPaymentMethod">
                      <option value="Cash">{{ i18n.t('paymentCash') }}</option>
                      <option value="ShamCash">{{ i18n.t('paymentShamCash') }}</option>
                    </select>
                    <input class="ui-input" [(ngModel)]="decisionPaymentReference" [placeholder]="i18n.t('paymentReference')" />
                    <input class="ui-input md:col-span-2" [(ngModel)]="decisionReason" [placeholder]="i18n.t('notesForAdmin')" />
                  </div>
                  <div class="mt-3 flex gap-2">
                    <mc-action
                      type="confirm-subscription-payment"
                      [entity]="selected()!"
                      [payload]="{
                        paymentMethod: decisionPaymentMethod,
                        paymentReference: decisionPaymentReference.trim() || null,
                        note: decisionReason.trim() || null
                      }"
                      labelOverride="Confirm payment"
                      (done)="load()"
                    />
                    <mc-action
                      type="reject-subscription"
                      [entity]="selected()!"
                      [payload]="{ note: decisionReason.trim() || null }"
                      [labelOverride]="i18n.t('reject')"
                      (done)="load()"
                    />
                  </div>
                </div>
              } @else if (selected()!.status === 'PaymentConfirmed') {
                <div class="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div class="text-xs text-slate-300">Payment is confirmed. Activate tenant subscription.</div>
                  <div class="mt-3 flex gap-2">
                    <mc-action
                      type="activate-subscription"
                      [entity]="selected()!"
                      [payload]="{ note: decisionReason.trim() || null }"
                      labelOverride="Activate"
                      (done)="load()"
                    />
                    <mc-action
                      type="reject-subscription"
                      [entity]="selected()!"
                      [payload]="{ note: decisionReason.trim() || null }"
                      [labelOverride]="i18n.t('reject')"
                      (done)="load()"
                    />
                  </div>
                </div>
              } @else {
                <div class="mt-4 ui-empty">{{ selected()!.decisionReason || 'No decision note.' }}</div>
              }
            } @else {
              <div class="ui-empty">{{ i18n.t('selectTenant') }}</div>
            }
          </mc-panel>
        </div>
        <div class="mc-stack-panel">
          <mc-panel [title]="'Grant trial'">
            <div class="grid gap-2 md:grid-cols-4">
              <input class="ui-input" [(ngModel)]="trialTenantId" placeholder="TenantId" />
              <input class="ui-input" [(ngModel)]="trialPlanId" placeholder="PlanId" />
              <input class="ui-input" [(ngModel)]="trialDays" placeholder="Days (3/5/7/custom)" type="number" />
              <button class="ui-button ui-button-secondary" type="button" (click)="grantTrial()">Grant trial</button>
            </div>
          </mc-panel>
        </div>
      </div>
    </section>
  `,
})
export class PlatformSubscriptionsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);
  requests = signal<QueueItem[]>([]);
  kpis = signal<RevenueKpi | null>(null);
  paymentAttempts = signal<PaymentAttempt[]>([]);
  selectedId = signal<string | null>(null);
  selected = signal<QueueItem | null>(null);
  searchQuery = '';
  statusFilter = 'all';
  decisionReason = '';
  decisionPaymentMethod: 'Cash' | 'ShamCash' = 'Cash';
  decisionPaymentReference = '';
  trialTenantId = '';
  trialPlanId = '';
  trialDays = 3;
  filteredRequests = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    const status = this.statusFilter;
    return this.requests().filter((x) => {
      const statusOk = status === 'all' || x.status === status;
      if (!statusOk) return false;
      if (!q) return true;
      return `${x.clinicName} ${x.requestedByDoctorName} ${x.requestedByDoctorEmail}`.toLowerCase().includes(q);
    });
  });
  openRequestsCount = computed(() =>
    this.requests().filter((x) => x.status === 'Requested' || x.status === 'AwaitingPayment' || x.status === 'PaymentConfirmed').length,
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.http.get<QueueItem[]>('/api/platform/subscriptions').subscribe({
      next: (r) => {
        const items = r ?? [];
        this.requests.set(items);
        const current = this.selectedId();
        const fallback = items[0] ?? null;
        const selected = items.find((x) => x.id === current) ?? fallback;
        this.selected.set(selected);
        this.selectedId.set(selected?.id ?? null);
        if (selected) this.loadPaymentAttempts(selected.id);
      },
    });
    this.http.get<RevenueKpi>('/api/platform/v2/kpis').subscribe({ next: (x) => this.kpis.set(x) });
  }

  select(item: QueueItem): void {
    this.selected.set(item);
    this.selectedId.set(item.id);
    this.decisionReason = '';
    this.decisionPaymentReference = item.paymentReference ?? '';
    this.decisionPaymentMethod = item.paymentMethod === 'ShamCash' ? 'ShamCash' : 'Cash';
    this.loadPaymentAttempts(item.id);
  }

  loadPaymentAttempts(subscriptionId: string): void {
    this.http.get<PaymentAttempt[]>(`/api/platform/v2/subscriptions/${subscriptionId}/payment-attempts`).subscribe({
      next: (x) => this.paymentAttempts.set(x ?? []),
      error: () => this.paymentAttempts.set([]),
    });
  }

  statusCount(status: string): number {
    return this.requests().filter((x) => x.status === status).length;
  }

  statusClass(status: string): string {
    if (status === 'Activated' || status === 'PaymentConfirmed') return 'ui-status-success';
    if (status === 'Rejected') return 'ui-status-danger';
    return 'ui-status-warning';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  timelineLabel(status: string): string {
    if (status === 'Requested') return this.i18n.t('timelineSubmitted');
    if (status === 'AwaitingPayment') return 'Awaiting payment';
    if (status === 'PaymentConfirmed') return 'Payment confirmed';
    if (status === 'Activated') return 'Activated';
    if (status === 'Rejected') return this.i18n.t('timelineRejected');
    return status;
  }

  grantTrial(): void {
    if (!this.trialTenantId || !this.trialPlanId || this.trialDays <= 0) return;
    this.http.post('/api/platform/trials', {
      tenantId: this.trialTenantId,
      planId: this.trialPlanId,
      days: this.trialDays,
      customDays: this.trialDays,
    }).subscribe({ next: () => this.load() });
  }

  
}

