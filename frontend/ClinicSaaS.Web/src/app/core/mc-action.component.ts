import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { McActionAuditService } from './mc-action-audit.service';
import { McPolicyService } from './mc-policy.service';
import { McActionRegistry } from './mc-action-registry.service';
import { McActionConfig, McActionType, McPolicyKey, PolicyContext } from './mc-action.types';
import { ToastService } from './toast.service';

@Component({
  selector: 'mc-action',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid gap-1">
      <button
        type="button"
        [class]="buttonClass()"
        [disabled]="busy() || !allowed"
        [title]="!allowed ? deniedReason : ''"
        (click)="handleClick()"
      >
        {{ label() }}
      </button>
      @if (nextStateHint()) {
        <span class="mc-text-micro text-slate-400">Next state: {{ nextStateHint() }}</span>
      }
      @if (!allowed && deniedReason) {
        <span class="mc-text-micro text-amber-300">{{ deniedReason }}</span>
      }
    </div>
  `,
})
export class McActionComponent implements OnInit {
  private readonly registry = inject(McActionRegistry);
  private readonly audit = inject(McActionAuditService);
  private readonly policy = inject(McPolicyService);
  private readonly toast = inject(ToastService);

  @Input({ required: true }) type!: McActionType;
  @Input() policyKey: McPolicyKey | null = null;
  @Input() entity: any;
  @Input() payload: any;
  @Input() labelOverride = '';

  @Output() done = new EventEmitter<void>();
  @Output() failed = new EventEmitter<void>();

  config!: McActionConfig;
  allowed = true;
  deniedReason = '';
  private context: PolicyContext = { userRole: 'Unknown', tenantId: null, userId: null };
  readonly busy = signal(false);

  ngOnInit(): void {
    this.config = this.registry.get(this.type);
    this.context = this.policy.buildContext(this.entity);
    const policyKey = this.policyKey ?? this.config.policy ?? null;
    if (policyKey) {
      const decision = this.policy.can(policyKey, this.context);
      this.allowed = decision.allowed;
      this.deniedReason = decision.reason ?? '';
    }
    if (this.config.permission) {
      this.allowed = this.config.permission(this.entity, this.payload);
    }
  }

  async handleClick(): Promise<void> {
    if (!this.allowed || this.busy()) return;
    try {
      if (this.config.requiresConfirmation) {
        const confirmed = window.confirm(this.config.confirmText || 'Are you sure?');
        if (!confirmed) return;
      }

      this.busy.set(true);
      await this.config.execute(this.entity, this.payload);
      this.audit.log(this.type, this.entity?.id, this.policyKey ?? this.config.policy ?? null, true, this.context);
      this.toast.show(this.config.successMessage || 'Done', 'success');
      this.done.emit();
    } catch {
      this.audit.log(this.type, this.entity?.id, this.policyKey ?? this.config.policy ?? null, false, this.context);
      this.toast.show(this.config.errorMessage || 'Failed', 'error');
      this.failed.emit();
    } finally {
      this.busy.set(false);
    }
  }

  label(): string {
    return this.labelOverride || this.config.label;
  }

  nextStateHint(): string {
    return this.config.nextStateHint ?? '';
  }

  buttonClass(): string {
    const variant = this.config.variant ?? this.inferredVariant();
    if (variant === 'danger') return 'ui-button ui-button-secondary h-8 px-3 border-red-500/40 text-red-100';
    if (variant === 'primary') return 'ui-button ui-button-primary h-8 px-3';
    return 'ui-button ui-button-secondary h-8 px-3';
  }

  private inferredVariant(): 'primary' | 'danger' | 'ghost' {
    if (this.type.includes('reject')) return 'danger';
    if (this.type.includes('approve') || this.type.includes('activate') || this.type.includes('confirm')) return 'primary';
    return 'ghost';
  }
}

