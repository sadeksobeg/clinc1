import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { McActionConfig, McActionType } from './mc-action.types';

@Injectable({ providedIn: 'root' })
export class McActionRegistry {
  private readonly actions = new Map<McActionType, McActionConfig>();

  constructor(private readonly http: HttpClient) {
    this.registerDefaults();
  }

  register(config: McActionConfig): void {
    this.actions.set(config.type, config);
  }

  get(type: McActionType): McActionConfig {
    const action = this.actions.get(type);
    if (!action) throw new Error(`Action not registered: ${type}`);
    return action;
  }

  private registerDefaults(): void {
    this.register({
      type: 'approve-subscription',
      label: 'Approve',
      variant: 'primary',
      policy: 'subscription.approve',
      nextStateHint: 'AwaitingPayment',
      requiresConfirmation: true,
      confirmText: 'Approve this subscription request?',
      execute: async (req: { id: string }, payload?: { note?: string }) => {
        await firstValueFrom(this.http.post(`/api/platform/subscriptions/${req.id}/approve`, { note: payload?.note ?? null }));
      },
      successMessage: 'Subscription request approved.',
      errorMessage: 'Failed to approve subscription request.',
    });

    this.register({
      type: 'reject-subscription',
      label: 'Reject',
      variant: 'danger',
      policy: 'subscription.reject',
      requiresConfirmation: true,
      confirmText: 'Reject this subscription request?',
      execute: async (req: { id: string }, payload?: { note?: string }) => {
        await firstValueFrom(this.http.post(`/api/platform/subscriptions/${req.id}/reject`, { note: payload?.note ?? null }));
      },
      successMessage: 'Subscription request rejected.',
      errorMessage: 'Failed to reject subscription request.',
    });

    this.register({
      type: 'confirm-subscription-payment',
      label: 'Confirm payment',
      variant: 'primary',
      policy: 'subscription.confirmPayment',
      nextStateHint: 'PaymentConfirmed',
      requiresConfirmation: true,
      confirmText: 'Confirm payment for this subscription?',
      execute: async (req: { id: string }, payload?: { paymentMethod: string; paymentReference?: string; note?: string }) => {
        await firstValueFrom(
          this.http.post(`/api/platform/subscriptions/${req.id}/confirm-payment`, {
            paymentMethod: payload?.paymentMethod,
            paymentReference: payload?.paymentReference ?? null,
            note: payload?.note ?? null,
          }),
        );
      },
      successMessage: 'Payment confirmed.',
      errorMessage: 'Failed to confirm payment.',
    });

    this.register({
      type: 'activate-subscription',
      label: 'Activate',
      variant: 'primary',
      policy: 'subscription.activate',
      nextStateHint: 'Activated',
      requiresConfirmation: true,
      confirmText: 'Activate this subscription now?',
      execute: async (req: { id: string }, payload?: { note?: string }) => {
        await firstValueFrom(this.http.post(`/api/platform/subscriptions/${req.id}/activate`, { note: payload?.note ?? null }));
      },
      successMessage: 'Subscription activated.',
      errorMessage: 'Failed to activate subscription.',
    });

    this.register({
      type: 'assign-conversation',
      label: 'Apply assignment',
      variant: 'ghost',
      policy: 'conversation.assign',
      execute: async (conversation: { id: string }, payload?: { assignedUserId?: string | null; priority?: string }) => {
        await firstValueFrom(
          this.http.post('/api/platform/support/assign', {
            conversationId: conversation.id,
            assignedUserId: payload?.assignedUserId ?? null,
            priority: payload?.priority ?? 'Normal',
          }),
        );
      },
      successMessage: 'Assignment updated.',
      errorMessage: 'Failed to update assignment.',
    });

    this.register({
      type: 'close-conversation',
      label: 'Close',
      variant: 'ghost',
      policy: 'conversation.close',
      requiresConfirmation: true,
      confirmText: 'Close this conversation?',
      execute: async (conversation: { id: string }) => {
        await firstValueFrom(this.http.post('/api/platform/support/close', { conversationId: conversation.id }));
      },
      successMessage: 'Conversation closed.',
      errorMessage: 'Failed to close conversation.',
    });

    this.register({
      type: 'mark-invoice-paid',
      label: 'Mark paid',
      variant: 'ghost',
      policy: 'invoice.markPaid',
      requiresConfirmation: true,
      confirmText: 'Mark this invoice as paid?',
      execute: async (invoice: { id: string }) => {
        await firstValueFrom(this.http.post(`/api/platform/invoices/${invoice.id}/mark-paid`, { paymentMethod: 'Cash', paymentReference: null }));
      },
      successMessage: 'Invoice marked as paid.',
      errorMessage: 'Failed to mark invoice as paid.',
    });
  }
}

