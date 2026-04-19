import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n.service';

type PricingRowDto = { tier: string; channel: string; monthlyPriceUsd: number; annualPriceUsd: number; includedAppointments: number; includedConversations: number; includedDoctorSeats: number };
type PricingPreviewDto = { rows: PricingRowDto[] };

@Component({
  selector: 'app-public-pricing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="ui-layout-marketing">
      <div class="ui-card">
        <div class="ui-page-header">
          <div>
            <h1 class="ui-page-title">{{ i18n.t('pricing') }}</h1>
            <p class="ui-page-subtitle">{{ i18n.t('pricingSubtitle') }}</p>
          </div>
          <div class="ui-page-actions">
            <span class="ui-context-badge">Plans</span>
            <a routerLink="/demo" class="ui-button ui-button-primary">{{ i18n.t('requestDemo') }}</a>
          </div>
        </div>
        <div class="ui-lane overflow-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-slate-400">
                <th class="px-3 py-2">{{ i18n.t('plan') }}</th>
                <th class="px-3 py-2">{{ i18n.t('channel') }}</th>
                <th class="px-3 py-2">USD / {{ i18n.t('monthly') }}</th>
                <th class="px-3 py-2">USD / {{ i18n.t('annual') }}</th>
                <th class="px-3 py-2">{{ i18n.t('appointmentsUsage') }}</th>
                <th class="px-3 py-2">{{ i18n.t('conversationsUsage') }}</th>
                <th class="px-3 py-2">{{ i18n.t('doctors') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.tier + ':' + row.channel) {
                <tr class="border-t border-white/10">
                  <td class="px-3 py-2">{{ row.tier }}</td>
                  <td class="px-3 py-2">{{ row.channel }}</td>
                  <td class="px-3 py-2">{{ row.monthlyPriceUsd }}</td>
                  <td class="px-3 py-2">{{ row.annualPriceUsd }}</td>
                  <td class="px-3 py-2">{{ row.includedAppointments }}</td>
                  <td class="px-3 py-2">{{ row.includedConversations }}</td>
                  <td class="px-3 py-2">{{ row.includedDoctorSeats }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div class="text-sm font-semibold">{{ i18n.t('addons') }}</div>
          <div class="mt-2 grid gap-2 md:grid-cols-2 text-xs">
            <div class="rounded-lg border border-white/10 px-3 py-2">Extra WhatsApp pack — USD 10 / 1000</div>
            <div class="rounded-lg border border-white/10 px-3 py-2">WhatsApp Campaigns — USD 15</div>
            <div class="rounded-lg border border-white/10 px-3 py-2">Advanced Analytics — USD 12</div>
            <div class="rounded-lg border border-white/10 px-3 py-2">API Access — USD 25</div>
            <div class="rounded-lg border border-white/10 px-3 py-2">Multi-branch — USD 20</div>
            <div class="rounded-lg border border-white/10 px-3 py-2">White-label — USD 30</div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class PublicPricingComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);
  rows = signal<PricingRowDto[]>([]);

  ngOnInit(): void {
    this.http.get<PricingPreviewDto>('/api/subscriptions/pricing').subscribe({
      next: (x) => this.rows.set(x.rows ?? []),
    });
  }
}

