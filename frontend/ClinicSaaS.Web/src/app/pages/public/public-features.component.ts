import { Component, inject } from '@angular/core';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-public-features',
  standalone: true,
  template: `
    <section class="ui-shell page-enter">
      <div class="ui-card">
        <h1 class="text-2xl font-semibold">{{ i18n.t('features') }}</h1>
        <p class="mt-2 text-sm text-slate-300">{{ i18n.t('featuresSubtitle') }}</p>
        <div class="mt-4 grid gap-3 md:grid-cols-3">
          <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">{{ i18n.t('mFeature1Title') }}<div class="mt-2 text-xs text-slate-400">{{ i18n.t('mFeature1Desc') }}</div></div>
          <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">{{ i18n.t('mFeature2Title') }}<div class="mt-2 text-xs text-slate-400">{{ i18n.t('mFeature2Desc') }}</div></div>
          <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">{{ i18n.t('mFeature3Title') }}<div class="mt-2 text-xs text-slate-400">{{ i18n.t('mFeature3Desc') }}</div></div>
        </div>
      </div>
    </section>
  `,
})
export class PublicFeaturesComponent {
  readonly i18n = inject(I18nService);
}

