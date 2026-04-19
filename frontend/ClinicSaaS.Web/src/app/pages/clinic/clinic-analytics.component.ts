import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../core/i18n.service';
import { EmptyStateComponent } from '../../core/empty-state.component';
import { McPanelComponent } from '../../core/mc-panel.component';
import { McSignalComponent } from '../../core/mc-signal.component';

type VisitTypeMetricDto = { visitType: string; count: number };
type ClinicAnalyticsDto = {
  appointments: number;
  cancelled: number;
  noShow: number;
  cancellationRatePercent: number;
  noShowRatePercent: number;
  conversations: number;
  conversionRatePercent: number;
  activeDoctors: number;
  waitTimeAvgMinutes: number;
  peakHours: string;
  visitTypeBreakdown: VisitTypeMetricDto[];
};

@Component({
  selector: 'app-clinic-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent, McPanelComponent, McSignalComponent],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
      <div class="mc-hero mc-enter">
        <div class="mc-hero-grid !lg:grid-cols-[1.2fr_0.8fr_auto]">
          <div>
            <div class="mc-eyebrow mc-text-micro">Clinic Insights</div>
            <h1 class="mt-2 mc-text-h1 text-slate-50">{{ i18n.t('analyticsDashboard') }}</h1>
            <p class="mc-caption mc-text-body">{{ i18n.t('analyticsSubtitle') }}</p>
          </div>
          <div>
            <div class="mc-text-micro uppercase tracking-[0.2em] text-blue-100/65">Conversion</div>
            <div class="mc-display mc-text-hero mt-1">{{ data()?.conversionRatePercent ?? 0 }}%</div>
            <div class="mc-text-small text-slate-300">Appointments / conversations</div>
          </div>
          <div class="flex items-center gap-2">
            <span class="ui-context-badge">Clinic Performance</span>
            <button class="ui-button ui-button-secondary" (click)="load()">{{ i18n.t('refresh') }}</button>
          </div>
        </div>
        @if ((data()?.conversionRatePercent ?? 0) === 0 && !loading()) {
          <div class="mt-4">
            <mc-signal
              type="warning"
              [title]="i18n.t('signalNoConversionsTitle')"
              [description]="i18n.t('signalNoConversionsCopy')"
            />
          </div>
        }
      </div>

      <mc-panel [title]="i18n.t('analyticsDashboard')" class="mc-stack-panel">
        <div class="ui-toolbar-workspace mt-1 grid gap-3 md:grid-cols-3">
          <input class="ui-search md:col-span-2" [(ngModel)]="searchText" [placeholder]="i18n.t('searchPatientDoctor')" (keydown.escape)="clearSearch()" />
          <div class="flex flex-wrap gap-2">
            @for (r of ranges; track r) {
              <button type="button" class="ui-chip" [class.ui-chip-active]="selectedRange() === r" (click)="setRange(r)">{{ r }}</button>
            }
          </div>
        </div>

        @if (loading()) {
          <div class="ui-fade-stagger mt-4 grid gap-3 md:grid-cols-4">
            @for (_ of [1,2,3,4]; track _) {
              <div class="ui-kpi"><div class="ui-skeleton h-3 w-2/3"></div><div class="ui-skeleton mt-3 h-7 w-1/2"></div></div>
            }
          </div>
        } @else {
          <div class="mc-insight-strip">
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">{{ i18n.t('appointmentsUsage') }}</div><div class="mt-1 mc-text-h3 font-semibold">{{ data()?.appointments ?? 0 }}</div><div class="mt-1 mc-text-micro text-slate-500">This month</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">{{ i18n.t('conversationsUsage') }}</div><div class="mt-1 mc-text-h3 font-semibold">{{ data()?.conversations ?? 0 }}</div><div class="mt-1 mc-text-micro text-slate-500">This month</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">{{ i18n.t('conversion') }}</div><div class="mt-1 mc-text-h3 font-semibold">{{ data()?.conversionRatePercent ?? 0 }}%</div><div class="mt-1 mc-text-micro text-slate-500">Appointments / conversations</div></div>
            <div class="mc-mini-kpi mc-space-panel"><div class="mc-text-small text-slate-400">{{ i18n.t('doctors') }}</div><div class="mt-1 mc-text-h3 font-semibold">{{ data()?.activeDoctors ?? 0 }}</div><div class="mt-1 mc-text-micro text-slate-500">{{ data()?.peakHours ?? '—' }}</div></div>
          </div>

          <div class="ui-fade-stagger mt-3 grid gap-3 lg:grid-cols-3">
            <div class="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
              <div class="text-slate-400">No-show</div>
              <div class="mt-1 font-semibold">{{ data()?.noShowRatePercent ?? 0 }}%</div>
              <div class="mt-2 h-2 rounded-full bg-white/10">
                <div class="h-2 rounded-full bg-amber-500/80" [style.width.%]="clampPercent(data()?.noShowRatePercent ?? 0)"></div>
              </div>
            </div>
            <div class="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
              <div class="text-slate-400">Cancellation</div>
              <div class="mt-1 font-semibold">{{ data()?.cancellationRatePercent ?? 0 }}%</div>
              <div class="mt-2 h-2 rounded-full bg-white/10">
                <div class="h-2 rounded-full bg-red-500/80" [style.width.%]="clampPercent(data()?.cancellationRatePercent ?? 0)"></div>
              </div>
            </div>
            <div class="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
              <div class="text-slate-400">{{ i18n.t('conversion') }}</div>
              <div class="mt-1 font-semibold">{{ data()?.conversionRatePercent ?? 0 }}%</div>
              <div class="mt-2 h-2 rounded-full bg-white/10">
                <div class="h-2 rounded-full bg-emerald-500/80" [style.width.%]="clampPercent(data()?.conversionRatePercent ?? 0)"></div>
              </div>
            </div>
          </div>

          <div class="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-semibold">{{ i18n.t('visitTypes') }}</div>
              <button class="ui-chip" (click)="sortDesc.set(!sortDesc())">{{ sortDesc() ? i18n.t('sortDesc') : i18n.t('sortAsc') }}</button>
            </div>
            <div class="mt-2 grid gap-2">
              @for (row of filteredRows(); track row.visitType) {
                <div class="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs">
                  <span>{{ row.visitType }}</span>
                  <span class="ui-status ui-status-neutral">{{ row.count }}</span>
                </div>
              } @empty {
                <app-empty-state
                  icon="📊"
                  [title]="i18n.t('analyticsEmptyTitle')"
                  [description]="i18n.t('analyticsEmptyDesc')"
                />
              }
            </div>
          </div>
        }
      </mc-panel>
      </div>
    </section>
  `,
})
export class ClinicAnalyticsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);
  data = signal<ClinicAnalyticsDto | null>(null);
  loading = signal(false);
  selectedRange = signal('30d');
  sortDesc = signal(true);
  searchText = '';
  private loadStartedAt = 0;
  readonly ranges = ['7d', '30d', '90d'];
  filteredRows = computed(() => {
    const q = this.searchText.trim().toLowerCase();
    const rows = [...(this.data()?.visitTypeBreakdown ?? [])].sort((a, b) => this.sortDesc() ? b.count - a.count : a.count - b.count);
    if (!q) return rows;
    return rows.filter((x) => x.visitType.toLowerCase().includes(q));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadStartedAt = Date.now();
    this.http.get<ClinicAnalyticsDto>('/api/product/analytics/clinic').subscribe({
      next: (x) => {
        this.data.set(x);
        this.finishLoading();
      },
      error: () => {
        this.data.set(null);
        this.finishLoading();
      },
    });
  }

  clampPercent(v: number): number {
    return Math.max(0, Math.min(100, v));
  }

  clearSearch(): void {
    this.searchText = '';
  }

  setRange(range: string): void {
    this.selectedRange.set(range);
  }

  private finishLoading(): void {
    const elapsed = Date.now() - this.loadStartedAt;
    const delay = Math.max(0, 300 - elapsed);
    setTimeout(() => this.loading.set(false), delay);
  }
}

