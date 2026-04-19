import { McActionType } from './mc-action.types';

export type McPredictionType = 'churn_risk' | 'no_show_risk' | 'overload_soon';
export type McPredictionSeverity = 'critical' | 'high' | 'medium' | 'low';
export type McPredictionBadge = 'risk' | 'opportunity';

export interface McPrediction {
  id: string;
  type: McPredictionType;
  title: string;
  message: string;
  severity: McPredictionSeverity;
  probability: number;
  confidence: number;
  suggestedAction?: McActionType;
  actionLabel?: string;
  actionEntity?: any;
  actionPayload?: any;
  badge: McPredictionBadge;
}

