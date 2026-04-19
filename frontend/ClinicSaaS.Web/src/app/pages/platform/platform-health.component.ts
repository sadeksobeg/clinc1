import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { I18nService } from '../../core/i18n.service';
import { McGridComponent } from '../../core/mc-grid.component';
import { McPanelComponent } from '../../core/mc-panel.component';

type HealthOverview = {
  uptimeSeconds: number;
  activeTenants: number;
  databaseHealthy: boolean;
  apiLatencyMs: number;
  workers: { workerName: string; lastSeenAtUtc: string; isHealthy: boolean }[];
  pendingSubscriptionActions: number;
};

@Component({
  selector: 'app-platform-health',
  standalone: true,
  imports: [McPanelComponent, McGridComponent],
  template: `
    <section class="mc-surface page-enter">
      <div class="mc-shell">
      <mc-panel [title]="i18n.t('systemHealth')" [loading]="status()==='Checking...'" [error]="status()==='Unreachable'" [data]="metrics()">
        <h1 class="text-2xl font-semibold">{{ i18n.t('systemHealth') }}</h1>
        <div class="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div class="text-sm">{{ i18n.t('apiStatus') }}: <span class="font-semibold">{{ status() }}</span></div>
          <div class="mt-1 text-xs text-slate-400">{{ lastChecked() }}</div>
        </div>
        @if (metrics(); as m) {
          <mc-grid cols="2" gap="md" class="mt-4">
            <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">Uptime: {{ m.uptimeSeconds }}s</div>
            <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">Active tenants: {{ m.activeTenants }}</div>
            <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">DB: {{ m.databaseHealthy ? 'Healthy' : 'Unavailable' }}</div>
            <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">Latency: {{ m.apiLatencyMs }}ms</div>
            <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm md:col-span-2">
              Workers:
              @for (w of m.workers; track w.workerName) {
                <span class="inline-block mr-2">{{ w.workerName }} ({{ w.isHealthy ? 'healthy' : 'stale' }})</span>
              }
              · Pending actions: {{ m.pendingSubscriptionActions }}
            </div>
          </mc-grid>
        }
      </mc-panel>
      </div>
    </section>
  `,
})
export class PlatformHealthComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);

  status = signal('Checking...');
  lastChecked = signal('');
  metrics = signal<HealthOverview | null>(null);

  ngOnInit(): void {
    this.http.get<HealthOverview>('/api/platform/health/overview').subscribe({
      next: (x) => {
        this.metrics.set(x);
        this.status.set(x.databaseHealthy ? 'Healthy' : 'Degraded');
      },
      error: () => this.status.set('Unreachable'),
      complete: () => this.lastChecked.set(new Date().toLocaleString()),
    });
  }
}

