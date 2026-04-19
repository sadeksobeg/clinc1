import { Injectable } from '@angular/core';
import { McActionType } from './mc-action.types';
import { McPredictionEngine } from './mc-prediction.engine';
import { McPrediction } from './mc-prediction.types';

export type McDecisionSeverity = 'high' | 'medium' | 'low';
export type McDecisionType = 'platform-overview';
export type McDecisionBadge = 'now' | 'risk' | 'opportunity';

export interface McDecision {
  id: string;
  title: string;
  message: string;
  severity: McDecisionSeverity;
  weight: number;
  confidence: number;
  probability?: number;
  badge?: McDecisionBadge;
  actionType?: McActionType;
  actionLabel?: string;
  actionEntity?: any;
  actionPayload?: any;
}

@Injectable({ providedIn: 'root' })
export class McDecisionEngine {
  constructor(private readonly predictionEngine: McPredictionEngine) {}

  evaluate(type: McDecisionType, context: any): McDecision[] {
    if (type === 'platform-overview') {
      return this.platformOverviewDecisions(context);
    }
    return [];
  }

  private platformOverviewDecisions(ctx: any): McDecision[] {
    const decisions: McDecision[] = [];
    const analytics = ctx?.analytics ?? {};
    const clinics = ctx?.clinics ?? [];
    const subscriptions = ctx?.subscriptions ?? [];
    const onlineUsers = ctx?.onlineUsers ?? [];
    const waitingPayment = subscriptions.find((s: any) => (s.status || '').toLowerCase().includes('await'));
    const trialEndingSoon = subscriptions.find((s: any) => {
      const status = (s.status || '').toLowerCase();
      const trialEndsAt = s.trialEndsAt ? Date.parse(s.trialEndsAt) : NaN;
      return status === 'trial' && !Number.isNaN(trialEndsAt) && trialEndsAt - Date.now() <= 1000 * 60 * 60 * 24 * 2;
    });
    const requestedCount = subscriptions.filter((s: any) => (s.status || '').toLowerCase().includes('request')).length;
    const activatedCount = subscriptions.filter((s: any) => (s.status || '').toLowerCase().includes('activ')).length;

    if ((analytics.conversionRatePercent ?? 0) === 0 && (analytics.activeClinics ?? 0) > 0) {
      decisions.push({
        id: 'zero-conversion',
        title: 'Zero conversion across active clinics',
        message: 'Active clinics exist but no successful activation conversion is detected.',
        severity: 'high',
        weight: 92,
        confidence: 0.92,
        badge: 'now',
      });
    }

    if (waitingPayment) {
      decisions.push({
        id: 'payment-stuck',
        title: 'Subscription stuck in payment stage',
        message: 'At least one tenant is blocked in AwaitingPayment and needs confirmation.',
        severity: 'high',
        weight: 90,
        confidence: 0.95,
        badge: 'now',
        actionType: 'confirm-subscription-payment',
        actionLabel: 'Resolve payment issue',
        actionEntity: waitingPayment,
        actionPayload: { paymentMethod: waitingPayment.paymentMethod || 'Cash', paymentReference: waitingPayment.paymentReference || null },
      });
    }

    if (trialEndingSoon) {
      decisions.push({
        id: 'trial-ending-soon',
        title: 'Trial expiring in less than 48 hours',
        message: 'Engage the tenant now to avoid expiration and churn.',
        severity: 'high',
        weight: 82,
        confidence: 0.8,
        badge: 'risk',
      });
    }

    if ((analytics.onlineUsers ?? 0) === 0 && (analytics.activeClinics ?? 0) > 0) {
      decisions.push({
        id: 'nobody-online',
        title: 'No users currently online',
        message: 'Presence is empty while clinics are active. Verify access or operating window.',
        severity: 'high',
        weight: 88,
        confidence: 0.84,
        badge: 'now',
      });
    }

    if ((analytics.churnLast30Days ?? 0) > 3) {
      decisions.push({
        id: 'churn-watch',
        title: 'Churn trend needs intervention',
        message: 'Recent churn exceeded safe threshold. Prioritize retention reviews.',
        severity: 'medium',
        weight: 70,
        confidence: 0.78,
        badge: 'now',
      });
    }

    if (requestedCount > activatedCount + 2) {
      decisions.push({
        id: 'pipeline-bottleneck',
        title: 'Pipeline bottleneck detected',
        message: 'Requested subscriptions are outpacing activations.',
        severity: 'medium',
        weight: 68,
        confidence: 0.73,
        badge: 'now',
      });
    }

    const inactiveClinics = clinics.filter((c: any) => c.onlineUsersCount === 0).length;
    if (inactiveClinics >= 3) {
      decisions.push({
        id: 'multi-clinic-idle',
        title: 'Multiple clinics are idle',
        message: `${inactiveClinics} clinics show no current online activity.`,
        severity: 'medium',
        weight: 60,
        confidence: 0.8,
        badge: 'now',
      });
    }

    if (onlineUsers.length > 0 && (analytics.onlineUsers ?? 0) <= 2) {
      decisions.push({
        id: 'thin-presence',
        title: 'Operational presence is thin',
        message: 'Only a small number of users are connected.',
        severity: 'low',
        weight: 40,
        confidence: 0.69,
        badge: 'now',
      });
    }

    if ((analytics.monthlyRevenueUsd ?? 0) === 0 && (analytics.activeClinics ?? 0) > 0) {
      decisions.push({
        id: 'zero-mrr',
        title: 'MRR is zero for active footprint',
        message: 'Revenue mismatch detected. Check billing activation flow.',
        severity: 'high',
        weight: 86,
        confidence: 0.89,
        badge: 'now',
      });
    }

    if ((analytics.activeClinics ?? 0) === 0 && subscriptions.length > 0) {
      decisions.push({
        id: 'subscriptions-no-actives',
        title: 'No active clinics despite subscriptions',
        message: 'There are subscriptions but active clinic count is zero.',
        severity: 'high',
        weight: 85,
        confidence: 0.75,
        badge: 'now',
      });
    }

    const predictions = this.predictionEngine.run(ctx);
    const predictionAccuracy = this.predictionEngine.accuracy();
    for (const p of predictions) {
      decisions.push(this.mapPredictionToDecision(p));
    }

    if (predictionAccuracy > 0) {
      decisions.push({
        id: 'prediction-accuracy',
        title: 'Prediction calibration',
        message: `Current prediction accuracy: ${predictionAccuracy}%`,
        severity: predictionAccuracy < 60 ? 'medium' : 'low',
        weight: predictionAccuracy < 60 ? 55 : 25,
        confidence: 0.7,
        badge: 'opportunity',
      });
    }

    if (decisions.length === 0) {
      decisions.push({
        id: 'healthy-state',
        title: 'Platform is stable',
        message: 'No critical decision detected now. Keep monitoring execution cadence.',
        severity: 'low',
        weight: 20,
        confidence: 0.9,
        badge: 'opportunity',
      });
    }

    return decisions.sort((a, b) => b.weight - a.weight || b.confidence - a.confidence);
  }

  private mapPredictionToDecision(prediction: McPrediction): McDecision {
    return {
      id: `pred-${prediction.id}`,
      title: prediction.title,
      message: prediction.message,
      severity: prediction.severity === 'critical' || prediction.severity === 'high' ? 'high' : prediction.severity,
      weight: Math.round(prediction.probability * 100),
      confidence: prediction.confidence,
      probability: prediction.probability,
      badge: prediction.badge,
      actionType: prediction.suggestedAction,
      actionLabel: prediction.actionLabel,
      actionEntity: prediction.actionEntity,
      actionPayload: prediction.actionPayload,
    };
  }
}

