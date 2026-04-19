import { Injectable } from '@angular/core';
import { McPrediction } from './mc-prediction.types';

@Injectable({ providedIn: 'root' })
export class McPredictionEngine {
  private outcomes: Array<{ predictionId: string; correct: boolean }> = [];

  run(context: any): McPrediction[] {
    const predictions: McPrediction[] = [];
    const analytics = context?.analytics ?? {};
    const subscriptions = context?.subscriptions ?? [];
    const clinics = context?.clinics ?? [];

    const activeClinics = analytics.activeClinics ?? 0;
    const churn = analytics.churnLast30Days ?? 0;
    const conversion = analytics.conversionRatePercent ?? 0;
    const onlineUsers = analytics.onlineUsers ?? 0;

    if (activeClinics > 0 && churn >= 2 && conversion < 20) {
      predictions.push({
        id: 'pred-churn-risk',
        type: 'churn_risk',
        title: 'Churn risk likely this cycle',
        message: 'Churn trend and weak conversion suggest retention pressure soon.',
        severity: churn > 4 ? 'critical' : 'high',
        probability: Math.min(0.92, 0.45 + churn * 0.08),
        confidence: 0.82,
        badge: 'risk',
      });
    }

    const waitingPayments = subscriptions.filter((s: any) => (s.status || '').toLowerCase().includes('await')).length;
    if (waitingPayments > 0 && conversion < 40) {
      predictions.push({
        id: 'pred-no-show-risk',
        type: 'no_show_risk',
        title: 'Payment-stage drop risk',
        message: 'Tenants waiting for payment may drop before activation without intervention.',
        severity: waitingPayments > 2 ? 'high' : 'medium',
        probability: Math.min(0.88, 0.4 + waitingPayments * 0.12),
        confidence: 0.76,
        suggestedAction: 'confirm-subscription-payment',
        actionLabel: 'Resolve payment issue',
        actionEntity: subscriptions.find((s: any) => (s.status || '').toLowerCase().includes('await')),
        badge: 'risk',
      });
    }

    const idleClinics = clinics.filter((c: any) => c.onlineUsersCount === 0).length;
    if (activeClinics > 0 && (onlineUsers <= 2 || idleClinics >= 3)) {
      predictions.push({
        id: 'pred-overload-soon',
        type: 'overload_soon',
        title: 'Operational overload likely within 20-30 min',
        message: 'Low presence coverage across clinics can cause queue strain soon.',
        severity: idleClinics >= 4 ? 'high' : 'medium',
        probability: Math.min(0.86, 0.42 + idleClinics * 0.08),
        confidence: 0.71,
        badge: 'risk',
      });
    }

    const now = Date.now();
    const trialEndingSoon = subscriptions.find((s: any) => {
      const status = (s.status || '').toLowerCase();
      const trialEndsAt = s.trialEndsAt ? Date.parse(s.trialEndsAt) : NaN;
      return status === 'trial' && !Number.isNaN(trialEndsAt) && trialEndsAt - now <= 1000 * 60 * 60 * 24 * 2;
    });
    if (trialEndingSoon) {
      predictions.push({
        id: 'pred-trial-ending-soon',
        type: 'churn_risk',
        title: 'Trial ending soon',
        message: 'At least one tenant trial is about to expire and may churn without conversion.',
        severity: 'high',
        probability: 0.74,
        confidence: 0.79,
        badge: 'risk',
      });
    }

    return predictions.sort((a, b) => b.probability - a.probability);
  }

  recordOutcome(predictionId: string, correct: boolean): void {
    this.outcomes.push({ predictionId, correct });
    if (this.outcomes.length > 500) this.outcomes.shift();
  }

  accuracy(): number {
    if (this.outcomes.length === 0) return 0;
    const hits = this.outcomes.filter((x) => x.correct).length;
    return Math.round((hits * 10000) / this.outcomes.length) / 100;
  }
}

