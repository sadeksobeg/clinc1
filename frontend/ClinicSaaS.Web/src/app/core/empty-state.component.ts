import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-empty-state, mc-empty',
  standalone: true,
  template: `
    <div class="ui-empty mc-space-panel">
      <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-300">
        {{ icon }}
      </div>
      <div class="mc-text-body font-semibold text-slate-100">{{ title }}</div>
      <div class="mt-1 mc-text-small text-slate-400">{{ description }}</div>
      @if (ctaLabel) {
        <button type="button" class="mc-signal-cta mt-3" (click)="cta.emit()">{{ ctaLabel }}</button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon = '○';
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() ctaLabel = '';
  @Output() cta = new EventEmitter<void>();
}

