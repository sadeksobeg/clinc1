import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

export type McSignalType = 'danger' | 'warning' | 'info';

@Component({
  selector: 'mc-signal',
  standalone: true,
  template: `
    <div class="mc-signal" [class]="signalClass()">
      <div class="mc-signal-title">{{ title }}</div>
      @if (description) {
        <div class="mc-signal-copy">{{ description }}</div>
      }
      @if (ctaLabel) {
        <button type="button" class="mc-signal-cta" (click)="cta.emit()">{{ ctaLabel }}</button>
      }
    </div>
  `,
})
export class McSignalComponent implements OnInit {
  @Input({ required: true }) type: McSignalType = 'info';
  @Input({ required: true }) title = '';
  @Input() description = '';
  @Input() ctaLabel = '';
  @Output() cta = new EventEmitter<void>();

  ngOnInit(): void {
    if (!this.title.trim()) {
      throw new Error('mc-signal requires a title');
    }
  }

  signalClass(): string {
    if (this.type === 'danger') return 'mc-signal-danger';
    if (this.type === 'warning') return 'mc-signal-warning';
    return 'mc-signal-info';
  }
}

