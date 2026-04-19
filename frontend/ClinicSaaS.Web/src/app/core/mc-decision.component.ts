import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { McActionAuditService } from './mc-action-audit.service';
import { McActionComponent } from './mc-action.component';
import { McDecision, McDecisionEngine, McDecisionType } from './mc-decision.engine';

@Component({
  selector: 'mc-decision',
  standalone: true,
  imports: [CommonModule, McActionComponent],
  template: `
    <div class="mc-panel mc-space-panel">
      <div class="mb-3 flex items-center justify-between">
        <div class="mc-text-h3 text-slate-100">Decision Strip</div>
        <div class="mc-text-micro text-slate-400">{{ decisions().length }} recommendations</div>
      </div>
      <div class="grid gap-3">
        @for (d of topDecisions(); track d.id) {
          <div class="rounded-xl border border-white/10 bg-black/20 p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="mc-text-body font-semibold text-slate-100">{{ d.title }}</div>
              <div class="flex items-center gap-2">
                <span class="ui-status ui-status-neutral">{{ d.badge || 'now' }}</span>
                <span class="ui-status" [class]="severityClass(d.severity)">{{ d.severity }}</span>
              </div>
            </div>
            <div class="mt-1 mc-text-small text-slate-300">{{ d.message }}</div>
            <div class="mt-2 mc-text-micro text-slate-500">
              Impact {{ d.weight }} · Confidence {{ toPercent(d.confidence) }}%
              @if (d.probability != null) {
                · Probability {{ toPercent(d.probability) }}%
              }
            </div>
            @if (d.actionType) {
              <div class="mt-3">
                <mc-action
                  [type]="d.actionType"
                  [entity]="d.actionEntity"
                  [payload]="d.actionPayload"
                  [labelOverride]="d.actionLabel || ''"
                  (done)="onDecisionApplied(d)"
                />
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class McDecisionComponent implements OnChanges {
  private readonly engine = inject(McDecisionEngine);
  private readonly audit = inject(McActionAuditService);

  @Input({ required: true }) type!: McDecisionType;
  @Input() context: any;
  @Input() maxItems = 3;
  @Output() apply = new EventEmitter<McDecision>();

  readonly decisions = signal<McDecision[]>([]);

  ngOnChanges(): void {
    if (!this.type) return;
    this.decisions.set(this.engine.evaluate(this.type, this.context));
  }

  topDecisions(): McDecision[] {
    return this.decisions().slice(0, this.maxItems);
  }

  severityClass(severity: string): string {
    if (severity === 'high') return 'ui-status-danger';
    if (severity === 'medium') return 'ui-status-warning';
    return 'ui-status-neutral';
  }

  toPercent(v: number): number {
    return Math.round(v * 100);
  }

  onDecisionApplied(decision: McDecision): void {
    this.audit.logDecision(
      decision.probability != null ? decision.id.replace(/^pred-/, '') : '',
      decision.id,
      decision.actionType ?? 'none',
      'applied',
      { weight: decision.weight, confidence: decision.confidence, probability: decision.probability ?? null },
    );
    this.apply.emit(decision);
  }
}

