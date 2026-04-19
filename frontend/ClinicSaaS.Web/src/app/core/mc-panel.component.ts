import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { EmptyStateComponent } from './empty-state.component';
import { McSignalComponent } from './mc-signal.component';

export type McPanelState = 'loading' | 'empty' | 'error' | 'ready';

export interface McAction {
  id: string;
  label: string;
}

@Component({
  selector: 'mc-panel',
  standalone: true,
  imports: [EmptyStateComponent, McSignalComponent],
  template: `
    <section class="mc-panel mc-space-panel">
      <header class="mb-4 flex items-center justify-between gap-3">
        <h3 class="mc-text-h3 text-slate-100">{{ title }}</h3>
        @if (actions.length) {
          <div class="flex items-center gap-2">
            @for (action of actions; track action.id) {
              <button type="button" class="mc-button-primary" (click)="actionClick.emit(action.id)">
                {{ action.label }}
              </button>
            }
          </div>
        }
        <ng-content select="[panel-actions]"></ng-content>
      </header>

      @if (resolvedState() === 'loading') {
        <div class="space-y-3" aria-label="loading">
          <div class="h-4 w-2/3 animate-pulse rounded bg-white/10"></div>
          <div class="h-4 w-full animate-pulse rounded bg-white/10"></div>
          <div class="h-4 w-5/6 animate-pulse rounded bg-white/10"></div>
        </div>
      } @else if (resolvedState() === 'empty') {
        <mc-empty
          [icon]="emptyIcon"
          [title]="emptyTitle"
          [description]="emptyDescription"
          [ctaLabel]="emptyCtaLabel"
          (cta)="emptyCta.emit()"
        />
      } @else if (resolvedState() === 'error') {
        <mc-signal
          type="danger"
          [title]="errorTitle"
          [description]="errorDescription"
          [ctaLabel]="errorCtaLabel"
          (cta)="errorCta.emit()"
        />
      } @else {
        <ng-content></ng-content>
      }
    </section>
  `,
})
export class McPanelComponent implements OnInit {
  @Input({ required: true }) title = '';
  @Input() state: McPanelState = 'ready';
  @Input() loading = false;
  @Input() error: unknown = null;
  @Input() data: unknown = null;
  @Input() actions: McAction[] = [];

  @Input() emptyIcon = '○';
  @Input() emptyTitle = 'No data';
  @Input() emptyDescription = 'There is nothing to show yet.';
  @Input() emptyCtaLabel = '';

  @Input() errorTitle = 'Something went wrong';
  @Input() errorDescription = 'Please refresh and try again.';
  @Input() errorCtaLabel = '';

  @Output() actionClick = new EventEmitter<string>();
  @Output() emptyCta = new EventEmitter<void>();
  @Output() errorCta = new EventEmitter<void>();

  ngOnInit(): void {
    if (!this.title.trim()) {
      throw new Error('mc-panel requires a title');
    }
    if (!['loading', 'empty', 'error', 'ready'].includes(this.state)) {
      throw new Error(`mc-panel received invalid state: ${this.state}`);
    }
  }

  resolvedState(): McPanelState {
    if (this.loading) return 'loading';
    if (this.error) return 'error';
    if (this.data !== null) {
      if (Array.isArray(this.data) && this.data.length === 0) return 'empty';
      if (!Array.isArray(this.data) && !this.data) return 'empty';
      return 'ready';
    }
    return this.state;
  }
}

