import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { McPolicyKey, PolicyContext, PolicyDecision } from './mc-action.types';

@Injectable({ providedIn: 'root' })
export class McPolicyService {
  constructor(private readonly auth: AuthService) {}

  buildContext(entity?: any): PolicyContext {
    const role = this.auth.getRole() ?? 'Unknown';
    const normalizedRole = role === 'PlatformAdmin' || role === 'Doctor' || role === 'Receptionist' ? role : 'Unknown';
    const state = entity?.status ?? entity?.state ?? null;
    const tenantId = this.auth.getTenantId();
    const userId = this.auth.getSubId();
    const ownership = Boolean(entity?.assignedUserId && userId && entity.assignedUserId === userId);
    return { userRole: normalizedRole, tenantId, userId, entityState: state, ownership };
  }

  can(policy: McPolicyKey, context: PolicyContext): PolicyDecision {
    const evaluator = this.policies[policy];
    if (!evaluator) return { allowed: false, reason: `Unknown policy: ${policy}` };
    return evaluator(context);
  }

  private readonly policies: Record<McPolicyKey, (context: PolicyContext) => PolicyDecision> = {
    'subscription.approve': (ctx) =>
      ctx.userRole === 'PlatformAdmin' && ctx.entityState === 'Requested'
        ? { allowed: true }
        : { allowed: false, reason: 'Only platform admins can approve requested subscriptions.' },
    'subscription.reject': (ctx) =>
      ctx.userRole === 'PlatformAdmin'
        ? { allowed: true }
        : { allowed: false, reason: 'Only platform admins can reject subscriptions.' },
    'subscription.confirmPayment': (ctx) =>
      ctx.userRole === 'PlatformAdmin' && ctx.entityState === 'AwaitingPayment'
        ? { allowed: true }
        : { allowed: false, reason: 'Payment can be confirmed only for AwaitingPayment by platform admins.' },
    'subscription.activate': (ctx) =>
      ctx.userRole === 'PlatformAdmin' && ctx.entityState === 'PaymentConfirmed'
        ? { allowed: true }
        : { allowed: false, reason: 'Activation requires platform admin and PaymentConfirmed state.' },
    'conversation.assign': (ctx) =>
      ctx.userRole === 'PlatformAdmin' ? { allowed: true } : { allowed: false, reason: 'Only platform admins can assign conversations.' },
    'conversation.close': (ctx) =>
      ctx.userRole === 'PlatformAdmin' || ctx.ownership
        ? { allowed: true }
        : { allowed: false, reason: 'Only platform admins or assigned owners can close conversations.' },
    'invoice.markPaid': (ctx) =>
      ctx.userRole === 'PlatformAdmin' ? { allowed: true } : { allowed: false, reason: 'Only platform admins can mark invoices as paid.' },
  };
}

