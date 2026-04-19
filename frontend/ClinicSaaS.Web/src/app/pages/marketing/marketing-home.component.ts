import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-marketing-home',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <section class="ui-layout-marketing">
      <div class="rounded-3xl border border-blue-400/20 bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-transparent p-10 animate-fade-in">
        <p class="text-xs uppercase tracking-[0.25em] text-blue-200">{{ i18n.t('mHeroBadge') }}</p>
        <h1 class="mt-3 text-4xl font-black leading-tight md:text-5xl">{{ i18n.t('mHeroTitle') }}</h1>
        <p class="mt-4 max-w-3xl text-slate-200">{{ i18n.t('mHeroSubtitle') }}</p>
        <div class="mt-6 flex flex-wrap gap-3">
          <a routerLink="/login" class="ui-button ui-button-primary inline-flex items-center">{{ i18n.t('startNow') }}</a>
          <a routerLink="/demo" class="ui-button ui-button-secondary inline-flex items-center">{{ i18n.t('requestDemo') }}</a>
        </div>
      </div>

      <div class="mt-5 grid gap-3 md:grid-cols-4">
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-300 animate-slide-up">Subscription workflow enabled</div>
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-300 animate-slide-up">Platform analytics from live data</div>
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-300 animate-slide-up">Multi-Tenant Secure</div>
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-300 animate-slide-up">AR/EN Native</div>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <div class="ui-card hover-lift"><div class="text-sm font-semibold">{{ i18n.t('mFeature1Title') }}</div><p class="mt-2 text-sm text-slate-300">{{ i18n.t('mFeature1Desc') }}</p></div>
        <div class="ui-card hover-lift"><div class="text-sm font-semibold">{{ i18n.t('mFeature2Title') }}</div><p class="mt-2 text-sm text-slate-300">{{ i18n.t('mFeature2Desc') }}</p></div>
        <div class="ui-card hover-lift"><div class="text-sm font-semibold">{{ i18n.t('mFeature3Title') }}</div><p class="mt-2 text-sm text-slate-300">{{ i18n.t('mFeature3Desc') }}</p></div>
      </div>

      <div class="ui-section grid gap-4 lg:grid-cols-2">
        <div class="ui-card">
          <h2 class="text-lg font-semibold">{{ i18n.t('pricing') }}</h2>
          <div class="mt-2 inline-flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
            <button class="rounded-lg px-3 py-1" [class.bg-blue-600]="billingCycle() === 'Monthly'" (click)="billingCycle.set('Monthly')">{{ i18n.t('monthly') }}</button>
            <button class="rounded-lg px-3 py-1" [class.bg-blue-600]="billingCycle() === 'Annual'" (click)="billingCycle.set('Annual')">{{ i18n.t('annual') }}</button>
          </div>
          <div class="mt-3 grid gap-3">
            @for (row of visibleRows(); track row.tier) {
              <div class="rounded-2xl border border-white/10 bg-black/20 p-4 hover-lift">
                <div class="text-sm font-semibold">{{ row.tier }} - WhatsApp</div>
                <div class="mt-1 text-2xl font-black">
                  USD {{ billingCycle() === 'Annual' ? row.annualPriceUsd : row.monthlyPriceUsd }}
                  <span class="text-sm font-medium text-slate-400">/{{ billingCycle() === 'Annual' ? i18n.t('annual') : i18n.t('perMonth') }}</span>
                </div>
                <div class="mt-1 text-xs text-slate-300">
                  {{ i18n.t('appointmentsUsage') }} {{ row.includedAppointments }} ·
                  {{ i18n.t('conversationsUsage') }} {{ row.includedConversations }} ·
                  {{ i18n.t('doctors') }} {{ row.includedDoctorSeats }}
                </div>
              </div>
            }
          </div>
        </div>
        <div class="ui-card hover-lift">
          <h2 class="text-lg font-semibold">{{ i18n.t('whyChooseUs') }}</h2>
          <ul class="mt-3 space-y-2 text-sm text-slate-200">
            <li>{{ i18n.t('why1') }}</li>
            <li>{{ i18n.t('why2') }}</li>
            <li>{{ i18n.t('why3') }}</li>
            <li>{{ i18n.t('why4') }}</li>
          </ul>
        </div>
      </div>

      <div class="ui-section ui-card">
        <h2 class="text-lg font-semibold">{{ i18n.t('addons') }}</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          @for (addon of addons(); track addon.id) {
            <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div class="text-sm font-semibold">{{ addon.name }}</div>
              <div class="mt-1 text-xs text-slate-400">{{ addon.unitType }}</div>
              <div class="mt-1 text-xl font-bold">USD {{ addon.unitPriceUsd }}</div>
            </div>
          }
        </div>
      </div>

      <div class="ui-section ui-card">
        <h2 class="text-lg font-semibold">{{ i18n.t('faq') }}</h2>
        <div class="mt-3 space-y-3 text-sm">
          <details class="rounded-xl border border-white/10 bg-black/20 p-3">
            <summary class="cursor-pointer font-medium">{{ i18n.t('faqQ1') }}</summary>
            <p class="mt-2 text-slate-300">{{ i18n.t('faqA1') }}</p>
          </details>
          <details class="rounded-xl border border-white/10 bg-black/20 p-3">
            <summary class="cursor-pointer font-medium">{{ i18n.t('faqQ2') }}</summary>
            <p class="mt-2 text-slate-300">{{ i18n.t('faqA2') }}</p>
          </details>
          <details class="rounded-xl border border-white/10 bg-black/20 p-3">
            <summary class="cursor-pointer font-medium">{{ i18n.t('faqQ3') }}</summary>
            <p class="mt-2 text-slate-300">{{ i18n.t('faqA3') }}</p>
          </details>
        </div>
      </div>

      <div class="ui-section ui-card">
        <h2 class="text-lg font-semibold">{{ i18n.t('requestDemo') }}</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <input class="ui-input" [(ngModel)]="lead.clinicName" [placeholder]="i18n.t('clinicName')" />
          <input class="ui-input" [(ngModel)]="lead.contactName" [placeholder]="i18n.t('contactName')" />
          <input class="ui-input" [(ngModel)]="lead.contactEmail" [placeholder]="i18n.t('contactEmail')" />
          <input class="ui-input" [(ngModel)]="lead.contactPhone" [placeholder]="i18n.t('phone')" />
          <select class="ui-input" [(ngModel)]="lead.preferredChannel">
            <option value="WhatsApp">WhatsApp</option>
            <option value="Telegram">Telegram</option>
          </select>
          <input class="ui-input" [(ngModel)]="lead.notes" [placeholder]="i18n.t('notes')" />
        </div>
        <button class="ui-button ui-button-primary mt-3" type="button" (click)="submitLead()">{{ i18n.t('sendRequest') }}</button>
      </div>
    </section>
  `,
})
export class MarketingHomeComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly i18n = inject(I18nService);
  billingCycle = signal<'Monthly' | 'Annual'>('Monthly');
  pricingRows = signal<PricingRowDto[]>([]);
  addons = signal<AddonCatalogDto[]>([]);
  visibleRows = computed(() => this.pricingRows().filter((x) => x.channel === 'WhatsApp'));
  lead = {
    clinicName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    preferredChannel: 'WhatsApp',
    notes: '',
  };

  ngOnInit(): void {
    this.http.get<PricingPreviewDto>('/api/subscriptions/pricing').subscribe({
      next: (x) => {
        this.pricingRows.set(x.rows);
        this.addons.set(x.addons);
      },
    });
  }

  submitLead(): void {
    if (!this.lead.clinicName.trim() || !this.lead.contactName.trim() || !this.lead.contactEmail.trim()) return;
    this.http.post('/api/operations/leads', this.lead).subscribe({
      next: () => {
        this.lead = {
          clinicName: '',
          contactName: '',
          contactEmail: '',
          contactPhone: '',
          preferredChannel: 'WhatsApp',
          notes: '',
        };
      },
    });
  }
}

type PricingRowDto = {
  tier: string;
  channel: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  annualDiscountPercent: number;
  includedAppointments: number;
  includedConversations: number;
  includedDoctorSeats: number;
};
type AddonCatalogDto = { id: string; code: string; name: string; unitType: string; unitPriceUsd: number };
type PricingPreviewDto = { rows: PricingRowDto[]; addons: AddonCatalogDto[] };
