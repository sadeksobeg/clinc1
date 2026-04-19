import { Component, inject } from '@angular/core';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-public-contact',
  standalone: true,
  template: `
    <section class="ui-shell page-enter">
      <div class="ui-card max-w-2xl">
        <h1 class="text-2xl font-semibold">{{ i18n.t('contact') }}</h1>
        <p class="mt-2 text-sm text-slate-300">{{ i18n.t('contactSubtitle') }}</p>
        <div class="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
          <div>Sales: sales@clinicsaas.local</div>
          <div class="mt-2">Support: support@clinicsaas.local</div>
          <div class="mt-2">Phone: +964 000 000 0000</div>
        </div>
      </div>
    </section>
  `,
})
export class PublicContactComponent {
  readonly i18n = inject(I18nService);
}

