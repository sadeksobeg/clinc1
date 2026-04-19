import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-startup-guide',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (visible()) {
      <section class="mc-panel mc-space-panel border border-blue-500/20 bg-blue-500/5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="mc-text-h3 text-slate-100">{{ title }}</h3>
            <p class="mt-1 mc-text-small text-slate-300">{{ description }}</p>
          </div>
          <button type="button" class="ui-button ui-button-secondary h-8 px-3" (click)="dismiss()">
            {{ dismissLabel }}
          </button>
        </div>
        <ol class="mt-3 grid gap-2">
          @for (step of steps; track step) {
            <li class="rounded-xl border border-white/10 bg-black/20 px-3 py-2 mc-text-small text-slate-200">{{ step }}</li>
          }
        </ol>
        @if (ctaLabel && ctaRoute) {
          <div class="mt-3">
            <a [routerLink]="ctaRoute" class="mc-glow-button inline-flex">{{ ctaLabel }}</a>
          </div>
        }
      </section>
    }
  `,
})
export class StartupGuideComponent implements OnInit {
  @Input({ required: true }) guideId = '';
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() steps: string[] = [];
  @Input() ctaLabel = '';
  @Input() ctaRoute = '';
  @Input() dismissLabel = 'إخفاء';

  readonly visible = signal(true);

  ngOnInit(): void {
    const key = this.storageKey();
    if (localStorage.getItem(key) === 'dismissed') {
      this.visible.set(false);
    }
  }

  dismiss(): void {
    localStorage.setItem(this.storageKey(), 'dismissed');
    this.visible.set(false);
  }

  private storageKey(): string {
    return `clinicSaaS_startup_guide_${this.guideId}`;
  }
}

