export type McActionType =
  | 'approve-subscription'
  | 'reject-subscription'
  | 'confirm-subscription-payment'
  | 'activate-subscription'
  | 'assign-conversation'
  | 'close-conversation'
  | 'mark-invoice-paid';

export type McPolicyKey =
  | 'subscription.approve'
  | 'subscription.reject'
  | 'subscription.confirmPayment'
  | 'subscription.activate'
  | 'conversation.assign'
  | 'conversation.close'
  | 'invoice.markPaid';

export type McUserRole = 'PlatformAdmin' | 'Doctor' | 'Receptionist' | 'Support' | 'Unknown';

export interface PolicyContext {
  userRole: McUserRole;
  tenantId: string | null;
  userId: string | null;
  entityState?: string | null;
  ownership?: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export interface McActionConfig<T = any, P = any> {
  type: McActionType;
  label: string;
  variant?: 'primary' | 'danger' | 'ghost';
  requiresConfirmation?: boolean;
  confirmText?: string;
  policy?: McPolicyKey;
  nextStateHint?: string;
  permission?: (entity: T, payload?: P) => boolean;
  execute: (entity: T, payload?: P) => Promise<void>;
  successMessage?: string;
  errorMessage?: string;
}

