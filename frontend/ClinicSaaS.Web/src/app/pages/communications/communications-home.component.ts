import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n.service';

@Component({
  selector: 'app-communications-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="mc-surface">
      <div class="mc-shell">
      <div class="mc-hero mc-enter">
        <div class="mc-hero-grid !lg:grid-cols-[1.2fr_0.8fr_auto]">
          <div>
            <div class="mc-eyebrow mc-text-micro">Clinic Communications</div>
            <h1 class="mt-2 mc-text-h1 text-slate-50">{{ i18n.t('communications') }}</h1>
            <p class="mc-caption mc-text-body">{{ i18n.t('communicationsSubtitle') }}</p>
          </div>
          <div>
            <div class="mc-text-micro uppercase tracking-[0.2em] text-blue-100/65">Inbox mode</div>
            <div class="mt-1 mc-text-h3 text-slate-100">Live interactions</div>
            <div class="mc-text-small text-slate-300">{{ i18n.t('communicationsHubHint') }}</div>
          </div>
          <a routerLink="/clinic/communications/conversations" class="mc-glow-button">Open Inbox</a>
        </div>
      </div>

      <div class="mc-stack-panel mc-panel mc-space-panel">
        <div class="grid gap-3 md:grid-cols-3 mc-enter-stagger">
          <a routerLink="/clinic/communications/conversations" class="mc-hover-lift rounded-2xl border border-white/10 bg-black/20 p-4 mc-text-body transition-all hover:border-blue-400/30 hover:bg-blue-500/10">
            <div class="font-semibold">{{ i18n.t('conversations') }}</div>
            <div class="mt-1 mc-text-small text-slate-400">{{ i18n.t('conversationsHint') }}</div>
          </a>
          <a routerLink="/clinic/communications/campaigns" class="mc-hover-lift rounded-2xl border border-white/10 bg-black/20 p-4 mc-text-body transition-all hover:border-blue-400/30 hover:bg-blue-500/10">
            <div class="font-semibold">{{ i18n.t('campaigns') }}</div>
            <div class="mt-1 mc-text-small text-slate-400">{{ i18n.t('campaignsHint') }}</div>
          </a>
          <a routerLink="/clinic/communications/templates" class="mc-hover-lift rounded-2xl border border-white/10 bg-black/20 p-4 mc-text-body transition-all hover:border-blue-400/30 hover:bg-blue-500/10">
            <div class="font-semibold">{{ i18n.t('templates') }}</div>
            <div class="mt-1 mc-text-small text-slate-400">{{ i18n.t('templatesHint') }}</div>
          </a>
        </div>
      </div>
      </div>
    </section>
  `,
})
export class CommunicationsHomeComponent {
  readonly i18n = inject(I18nService);
}

