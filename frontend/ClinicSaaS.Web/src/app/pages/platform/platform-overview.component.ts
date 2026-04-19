import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../../core/empty-state.component';
import { I18nService } from '../../core/i18n.service';
import { McDecisionComponent } from '../../core/mc-decision.component';
import { McPanelComponent } from '../../core/mc-panel.component';
import { McSignalComponent } from '../../core/mc-signal.component';
import { StartupGuideComponent } from '../../core/startup-guide.component';
import { ToastService } from '../../core/toast.service';

type PlatformAnalyticsOverviewDto = {
  activeClinics: number;
  onlineUsers: number;
  monthlyRevenueUsd: number;
  churnLast30Days: number;
  conversionRatePercent: number;
};
type ClinicRow = {
  id: string;
  name: string;
  subscriptionStatus: string;
  subscriptionPlan: string;
  doctorsCount: number;
  receptionistsCount: number;
  onlineUsersCount: number;
  lastActivityAt: string | null;
  createdAt: string;
};
type OnlineClinic = {
  tenantId: string;
  clinicName: string;
  doctors: { userId: string; fullName: string; email: string; lastSeenAt: string | null }[];
  receptionists: { userId: string; fullName: string; email: string; lastSeenAt: string | null }[];
};
type SubscriptionItem = {
  id: string;
  tenantId: string;
  clinicName: string;
  planTier: string;
  channel: string;
  cycle: string;
  status: string;
  finalPriceUsd: number;
  paymentReference: string;
};
type ActivityItem = {
  id: string;
  action: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  timestamp: string;
};

@Component({
  selector: 'app-platform-overview',
  standalone: true,
  imports: [RouterLink, FormsModule, McPanelComponent, McSignalComponent, EmptyStateComponent, McDecisionComponent, StartupGuideComponent],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
        <div class="mc-hero mc-enter">
          <div class="mc-hero-grid">
            <div>
              <div class="mc-eyebrow mc-text-micro">Platform Control Tower</div>
              <h1 class="mt-2 mc-text-h1 text-slate-50">{{ i18n.t('platformOverview') }}</h1>
              <p class="mc-caption mc-text-body">{{ i18n.t('platformDecisionFocus') }}</p>
            </div>
            <div class="grid gap-2">
              <div class="mc-text-small text-slate-300">{{ i18n.t('platformHealthStatus') }}</div>
              <div class="mc-text-h3 text-emerald-200">{{ platformHealthLabel() }}</div>
            </div>
            <div class="flex gap-2">
              <button class="ui-button ui-button-secondary" (click)="loadAll()">{{ i18n.t('refresh') }}</button>
              <a routerLink="/platform/billing" class="mc-glow-button">{{ i18n.t('billingInvoices') }}</a>
            </div>
          </div>
          <div class="mt-4 flex items-center gap-2">
            <button class="ui-chip" [class.ui-chip-active]="focusMode() === 'all'" (click)="focusMode.set('all')">{{ i18n.t('focusAll') }}</button>
            <button class="ui-chip" [class.ui-chip-active]="focusMode() === 'issues'" (click)="focusMode.set('issues')">{{ i18n.t('focusIssuesOnly') }}</button>
          </div>
          <div class="mt-2 mc-text-micro text-slate-400">
            عرض {{ visibleClinics().length }} من {{ clinics().length }} عيادة
          </div>
          <div class="mc-insight-strip mt-6">
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">{{ i18n.t('activeClinics') }}</div><div class="mt-1 mc-text-h3 text-slate-100">{{ analytics()?.activeClinics ?? 0 }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">{{ i18n.t('onlineUsersLabel') }}</div><div class="mt-1 mc-text-h3 text-slate-100">{{ analytics()?.onlineUsers ?? 0 }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">{{ i18n.t('monthlyRevenueLabel') }}</div><div class="mt-1 mc-text-h3 text-slate-100">USD {{ analytics()?.monthlyRevenueUsd ?? 0 }}</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">{{ i18n.t('conversion') }}</div><div class="mt-1 mc-text-h3 text-slate-100">{{ analytics()?.conversionRatePercent ?? 0 }}%</div></div>
          </div>
          @if ((analytics()?.conversionRatePercent ?? 0) === 0) {
            <div class="mt-4">
              <mc-signal
                type="danger"
                [title]="i18n.t('signalNoConversionsTitle')"
                [description]="i18n.t('signalNoConversionsCopy')"
                [ctaLabel]="i18n.t('signalNoConversionsCta')"
              />
            </div>
          }
          @if (waitingPaymentsCount() > 0) {
            <div class="mt-3">
              <mc-signal
                type="warning"
                [title]="i18n.t('signalPaymentsStuckTitle')"
                [description]="i18n.t('signalPaymentsStuckCopy') + ': ' + waitingPaymentsCount()"
              />
            </div>
          }
        </div>

        <div class="mc-stack-panel">
          <app-startup-guide
            guideId="platform-admin"
            [title]="i18n.t('startupGuidePlatformTitle')"
            [description]="i18n.t('startupGuidePlatformDesc')"
            [steps]="[
              i18n.t('startupGuidePlatformStep1'),
              i18n.t('startupGuidePlatformStep2'),
              i18n.t('startupGuidePlatformStep3')
            ]"
            [ctaLabel]="i18n.t('startupGuidePlatformCta')"
            ctaRoute="/platform/billing"
            [dismissLabel]="i18n.t('startupGuideHide')"
          />
        </div>

        <div class="mc-stack-panel grid gap-8 lg:grid-cols-2">
          <mc-decision type="platform-overview" [context]="decisionContext()" [maxItems]="3" (apply)="loadAll()" />
        </div>

        <div class="mc-stack-panel grid gap-8 lg:grid-cols-2">
          <mc-panel [title]="i18n.t('manageActiveClinicsCta') + ' (' + (analytics()?.activeClinics ?? 0) + ')'">
            <div panel-actions>
              <a routerLink="/platform/clinics" class="mc-text-small text-blue-300 hover:text-blue-200">{{ i18n.t('openSubscriptionRequestsPage') }}</a>
            </div>
            <div class="max-h-[24rem] overflow-auto space-y-2">
              @for (c of visibleClinics(); track c.id) {
                <div class="mc-hover-lift rounded-2xl border border-white/10 bg-black/20 p-4" [class.opacity-60]="c.onlineUsersCount === 0">
                  <div class="flex items-center justify-between gap-2">
                    <div class="mc-text-body font-semibold">{{ c.name }}</div>
                    <span class="ui-status ui-status-neutral">{{ c.subscriptionStatus }}</span>
                  </div>
                  <div class="mt-1 mc-text-small text-slate-400">{{ c.subscriptionPlan }} · D {{ c.doctorsCount }} · R {{ c.receptionistsCount }} · {{ i18n.t('onlineUsersLabel') }} {{ c.onlineUsersCount }}</div>
                  <div class="mt-3 flex gap-2">
                    <button class="ui-button ui-button-secondary h-8 px-3" (click)="suspend(c.id)">{{ i18n.t('suspend') }}</button>
                    <button class="ui-button ui-button-secondary h-8 px-3" (click)="reactivate(c.id)">{{ i18n.t('reactivate') }}</button>
                  </div>
                </div>
              } @empty {
                <mc-empty icon="◌" [title]="i18n.t('noData')" [description]="i18n.t('noData')" />
              }
            </div>
          </mc-panel>

          <mc-panel [title]="i18n.t('subscriptionPipelineTitle')">
            <div class="grid gap-3 md:grid-cols-2">
              @for (stage of pipelineStages(); track stage.key) {
                <div class="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div class="mc-text-small text-slate-400">{{ stage.label }}</div>
                  <div class="mt-1 mc-text-h3 text-slate-100">{{ stage.items.length }}</div>
                  <div class="mt-3 space-y-2">
                    @for (item of stage.items.slice(0, 3); track item.id) {
                      <div class="rounded-xl border border-white/10 px-3 py-2 mc-text-small text-slate-300">
                        {{ item.clinicName }} · {{ item.planTier }}
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </mc-panel>
        </div>

        <div class="mc-stack-panel grid gap-8 lg:grid-cols-2">
          <mc-panel [title]="i18n.t('onlineUsersLabel')">
            <div class="mb-3 grid gap-2 md:grid-cols-2">
              <input class="ui-input h-9" [(ngModel)]="tenantFilter" [placeholder]="i18n.t('filterByClinic')" />
              <input class="ui-input h-9" [(ngModel)]="onlineQuery" [placeholder]="i18n.t('searchUserEmail')" />
            </div>
            <div class="max-h-[24rem] overflow-auto space-y-2">
              @for (g of filteredOnlineUsers(); track g.tenantId) {
                <div class="mc-hover-lift rounded-xl border border-white/10 bg-black/20 p-3">
                  <div class="flex items-center justify-between">
                    <div class="mc-text-body font-semibold">{{ g.clinicName }}</div>
                    <div class="flex items-center gap-2 mc-text-small text-emerald-300">
                      <span class="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
                      {{ g.doctors.length + g.receptionists.length }}
                    </div>
                  </div>
                  <div class="mt-1 mc-text-small text-slate-400">{{ i18n.t('doctors') }}: {{ g.doctors.length }} · {{ i18n.t('reception') }}: {{ g.receptionists.length }}</div>
                  <div class="mt-1 mc-text-micro text-slate-500">{{ i18n.t('lastActivityAtLabel') }} {{ formatDate(lastSeen(g)) }}</div>
                </div>
              } @empty {
                <mc-empty icon="◎" [title]="i18n.t('noOnlineUsers')" [description]="i18n.t('noOnlineUsers')" />
              }
            </div>
            @if ((analytics()?.onlineUsers ?? 0) === 0) {
              <div class="mt-3">
                <mc-signal
                  type="info"
                  [title]="i18n.t('signalNoUsersOnlineTitle')"
                  [description]="i18n.t('signalNoUsersOnlineCopy')"
                />
              </div>
            }
          </mc-panel>

          <mc-panel [title]="i18n.t('activityTimeline')">
            <div class="max-h-[24rem] overflow-auto space-y-2">
              @for (a of activity(); track a.id) {
                <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div class="mc-text-body font-semibold">{{ a.action }}</div>
                  <div class="mt-1 mc-text-small text-slate-400">{{ a.entityType }} · {{ a.entityId }}</div>
                  <div class="mt-1 mc-text-micro text-slate-500">{{ formatDate(a.timestamp) }}</div>
                </div>
              } @empty {
                <mc-empty icon="⋯" [title]="i18n.t('noActivity')" [description]="i18n.t('noActivity')" />
              }
            </div>
          </mc-panel>
        </div>
      </div>
    </section>
  `,
})
export class PlatformOverviewComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  analytics = signal<PlatformAnalyticsOverviewDto | null>(null);
  clinics = signal<ClinicRow[]>([]);
  onlineUsers = signal<OnlineClinic[]>([]);
  tenantFilter = '';
  onlineQuery = '';
  focusMode = signal<'all' | 'issues'>('all');
  subscriptions = signal<SubscriptionItem[]>([]);
  activity = signal<ActivityItem[]>([]);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly problematicClinicIds = computed(() => {
    const ids = new Set<string>();
    for (const c of this.clinics()) {
      const hasPresenceIssue = c.onlineUsersCount === 0;
      const hasSubscriptionIssue = this.mapSubscriptionStage(c.subscriptionStatus) !== 'activated';
      if (hasPresenceIssue || hasSubscriptionIssue) ids.add(c.id);
    }
    for (const s of this.subscriptions()) {
      if (this.mapSubscriptionStage(s.status) !== 'activated') ids.add(s.tenantId);
    }
    return Array.from(ids);
  });
  private readonly visibleSubscriptions = computed(() => {
    if (this.focusMode() === 'all') return this.subscriptions();
    const problematic = new Set(this.problematicClinicIds());
    return this.subscriptions().filter((x) => problematic.has(x.tenantId));
  });
  readonly filteredOnlineUsers = computed(() => {
    const tenant = this.tenantFilter.trim().toLowerCase();
    const q = this.onlineQuery.trim().toLowerCase();
    const problematic = new Set(this.problematicClinicIds());
    return this.onlineUsers().filter((x) => {
      if (this.focusMode() === 'issues' && !problematic.has(x.tenantId)) return false;
      const tenantOk = !tenant || x.clinicName.toLowerCase().includes(tenant);
      if (!tenantOk) return false;
      if (!q) return true;
      const people = [...x.doctors, ...x.receptionists];
      return x.clinicName.toLowerCase().includes(q) || people.some((p) => `${p.fullName} ${p.email}`.toLowerCase().includes(q));
    });
  });
  readonly pipelineStages = computed(() => {
    const groups = [
      { key: 'requested', label: this.i18n.t('stageRequested'), items: [] as SubscriptionItem[] },
      { key: 'awaiting', label: this.i18n.t('stageAwaitingPayment'), items: [] as SubscriptionItem[] },
      { key: 'confirmed', label: this.i18n.t('stagePaymentConfirmed'), items: [] as SubscriptionItem[] },
      { key: 'activated', label: this.i18n.t('stageActivated'), items: [] as SubscriptionItem[] },
    ];
    for (const item of this.visibleSubscriptions()) {
      const normalized = this.mapSubscriptionStage(item.status);
      const bucket = groups.find((x) => x.key === normalized);
      if (bucket) bucket.items.push(item);
    }
    return groups;
  });
  readonly waitingPaymentsCount = computed(() => this.pipelineStages().find((x) => x.key === 'awaiting')?.items.length ?? 0);
  readonly visibleClinics = computed(() => {
    if (this.focusMode() === 'all') return this.clinics();
    return this.clinics().filter((x) => x.onlineUsersCount === 0 || this.mapSubscriptionStage(x.subscriptionStatus) !== 'activated');
  });
  readonly decisionContext = computed(() => ({
    analytics: this.analytics(),
    clinics: this.clinics(),
    subscriptions: this.subscriptions(),
    onlineUsers: this.onlineUsers(),
  }));

  ngOnInit(): void {
    this.loadAll();
    this.refreshTimer = setInterval(() => this.loadOnlineUsers(), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  loadAll(): void {
    this.http.get<PlatformAnalyticsOverviewDto>('/api/platform/analytics/overview').subscribe({ next: (x) => this.analytics.set(x) });
    this.http.get<ClinicRow[]>('/api/platform/clinics').subscribe({ next: (x) => this.clinics.set(x ?? []) });
    this.loadOnlineUsers();
    this.http.get<SubscriptionItem[]>('/api/platform/subscriptions').subscribe({ next: (x) => this.subscriptions.set(x ?? []) });
    this.http.get<ActivityItem[]>('/api/platform/activity').subscribe({ next: (x) => this.activity.set(x ?? []) });
  }

  loadOnlineUsers(): void {
    this.http.get<{ clinics: OnlineClinic[] }>('/api/platform/online-users').subscribe({ next: (x) => this.onlineUsers.set(x?.clinics ?? []) });
  }

  suspend(tenantId: string): void {
    this.http.post(`/api/platform/clinics/${tenantId}/suspend`, {}).subscribe({
      next: () => {
        this.toast.show('Clinic suspended.', 'success');
        this.loadAll();
      },
      error: () => this.toast.show(this.i18n.t('requestFailed'), 'error'),
    });
  }

  reactivate(tenantId: string): void {
    this.http.post(`/api/platform/clinics/${tenantId}/reactivate`, {}).subscribe({
      next: () => {
        this.toast.show('Clinic reactivated.', 'success');
        this.loadAll();
      },
      error: () => this.toast.show(this.i18n.t('requestFailed'), 'error'),
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  lastSeen(group: OnlineClinic): string {
    return group.doctors[0]?.lastSeenAt || group.receptionists[0]?.lastSeenAt || new Date().toISOString();
  }

  platformHealthLabel(): string {
    const churn = this.analytics()?.churnLast30Days ?? 0;
    if (churn === 0) return this.i18n.t('healthyLabel');
    if (churn <= 2) return this.i18n.t('healthyWithWatchLabel');
    return this.i18n.t('degradedLabel');
  }

  private mapSubscriptionStage(status: string): 'requested' | 'awaiting' | 'confirmed' | 'activated' {
    const v = (status || '').toLowerCase();
    if (v.includes('await') || v.includes('payment') && !v.includes('confirm')) return 'awaiting';
    if (v.includes('confirm')) return 'confirmed';
    if (v.includes('activ')) return 'activated';
    return 'requested';
  }
}

