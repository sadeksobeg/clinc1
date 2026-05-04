export type CalibrationThresholds = {
  risk_threshold: number;
  confidence_threshold: number;
  medical_boosts: {
    breathing_issue: number;
  };
};

export type CalibrationStats = {
  sample_size: number;
  false_positive_emergency: number;
  false_negative_emergency: number;
  emergency_cases: number;
  corrected_signal_cases: number;
  breathing_mismatch_rate: number;
  false_positive_rate: number;
  false_negative_rate: number;
};

export type CalibrationSuggestion = {
  suggested_risk_threshold: number;
  suggested_confidence_threshold: number;
  suggested_breathing_boost: number;
  reason: string;
  confidence: number;
  high_drift: boolean;
  stats: CalibrationStats;
};

export type CalibrationSample = {
  model_decision: string | null;
  corrected_decision: string | null;
  reviewer: string | null;
  note: string | null;
  has_execution: boolean;
  model_signals: {
    breathing_issue?: boolean;
  };
  corrected_signals: {
    breathing_issue?: boolean;
  } | null;
};

const DEFAULT_THRESHOLDS: CalibrationThresholds = {
  risk_threshold: 3.5,
  confidence_threshold: 0.7,
  medical_boosts: {
    breathing_issue: 2,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

export function getCurrentCalibrationThresholds(metadata: Record<string, unknown> | null | undefined): CalibrationThresholds {
  const calibration = (metadata?.ai_calibration ?? {}) as Record<string, unknown>;
  const scope = typeof calibration.scope === "string" ? calibration.scope : "clinic_v1";
  if (scope !== "clinic_v1") return DEFAULT_THRESHOLDS;
  const current = (calibration.current ?? {}) as Record<string, unknown>;
  const medicalBoosts = (current.medical_boosts ?? {}) as Record<string, unknown>;

  const risk = typeof current.risk_threshold === "number" ? current.risk_threshold : DEFAULT_THRESHOLDS.risk_threshold;
  const conf =
    typeof current.confidence_threshold === "number"
      ? current.confidence_threshold
      : typeof metadata?.ai_emergency_confidence_threshold === "number"
        ? (metadata.ai_emergency_confidence_threshold as number)
        : DEFAULT_THRESHOLDS.confidence_threshold;
  const breathing =
    typeof medicalBoosts.breathing_issue === "number"
      ? medicalBoosts.breathing_issue
      : DEFAULT_THRESHOLDS.medical_boosts.breathing_issue;

  return {
    risk_threshold: clamp(round(risk, 2), 2.5, 4.5),
    confidence_threshold: clamp(round(conf, 2), 0.4, 0.9),
    medical_boosts: {
      breathing_issue: clamp(round(breathing, 2), 1, 3),
    },
  };
}

function withSafetyGuard(next: CalibrationThresholds, current: CalibrationThresholds): CalibrationThresholds {
  return {
    risk_threshold: clamp(round(next.risk_threshold, 2), current.risk_threshold - 0.2, current.risk_threshold + 0.2),
    confidence_threshold: clamp(
      round(next.confidence_threshold, 2),
      current.confidence_threshold - 0.05,
      current.confidence_threshold + 0.05,
    ),
    medical_boosts: {
      breathing_issue: clamp(
        round(next.medical_boosts.breathing_issue, 2),
        current.medical_boosts.breathing_issue - 0.2,
        current.medical_boosts.breathing_issue + 0.2,
      ),
    },
  };
}

export function buildCalibrationSuggestion(
  samples: CalibrationSample[],
  current: CalibrationThresholds,
): CalibrationSuggestion | null {
  const trustedReviewers = (process.env.CALIBRATION_TRUSTED_REVIEWERS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const usable = samples.filter((s) => {
    const hasCorrection = Boolean(s.corrected_decision || s.corrected_signals);
    if (!hasCorrection) return false;
    if (!s.has_execution) return false;
    if (!s.note?.trim()) return false;
    if (trustedReviewers.length > 0) {
      return s.reviewer != null && trustedReviewers.includes(s.reviewer);
    }
    return true;
  });
  if (usable.length < 50) return null;

  let fp = 0;
  let fn = 0;
  let emergencyCases = 0;
  let correctedSignalCases = 0;
  let breathingMismatchCount = 0;

  for (const s of usable) {
    const modelEmergency = String(s.model_decision || "").toUpperCase() === "EMERGENCY";
    const correctedEmergency = String(s.corrected_decision || "").toUpperCase() === "EMERGENCY";

    if (modelEmergency) emergencyCases += 1;
    if (modelEmergency && !correctedEmergency) fp += 1;
    if (!modelEmergency && correctedEmergency) fn += 1;

    if (s.corrected_signals && typeof s.corrected_signals.breathing_issue === "boolean") {
      correctedSignalCases += 1;
      if (Boolean(s.model_signals?.breathing_issue) !== Boolean(s.corrected_signals.breathing_issue)) {
        breathingMismatchCount += 1;
      }
    }
  }

  const total = usable.length;
  const fpRate = fp / total;
  const fnRate = fn / total;
  const breathingMismatchRate = correctedSignalCases ? breathingMismatchCount / correctedSignalCases : 0;

  let next: CalibrationThresholds = {
    risk_threshold: current.risk_threshold,
    confidence_threshold: current.confidence_threshold,
    medical_boosts: { breathing_issue: current.medical_boosts.breathing_issue },
  };
  const reasons: string[] = [];
  const oldRisk = current.risk_threshold;
  const oldConfidence = current.confidence_threshold;

  if (fpRate >= 0.2) {
    next.risk_threshold += 0.2;
    next.confidence_threshold += 0.05;
    reasons.push("high false positive emergency rate");
  } else if (fnRate >= 0.12) {
    next.risk_threshold -= 0.2;
    next.confidence_threshold -= 0.05;
    reasons.push("high false negative emergency rate");
  } else {
    reasons.push("emergency error rate within tolerance");
  }

  if (breathingMismatchRate >= 0.25) {
    const correctedTrueCount = usable.filter(
      (s) => s.corrected_signals && s.corrected_signals.breathing_issue === true,
    ).length;
    const modelTrueCount = usable.filter((s) => s.model_signals?.breathing_issue === true).length;
    if (correctedTrueCount > modelTrueCount) {
      next.medical_boosts.breathing_issue += 0.2;
      reasons.push("under-detection in breathing signal");
    } else if (correctedTrueCount < modelTrueCount) {
      next.medical_boosts.breathing_issue -= 0.2;
      reasons.push("over-detection in breathing signal");
    }
  }

  next = {
    risk_threshold: clamp(next.risk_threshold, 2.5, 4.5),
    confidence_threshold: clamp(next.confidence_threshold, 0.4, 0.9),
    medical_boosts: {
      breathing_issue: clamp(next.medical_boosts.breathing_issue, 1, 3),
    },
  };
  const highDrift =
    Math.abs(next.risk_threshold - oldRisk) > 0.5 ||
    Math.abs(next.confidence_threshold - oldConfidence) > 0.5;
  next = withSafetyGuard(next, current);

  const confidence = clamp(round((Math.min(1, total / 200) + Math.max(fpRate, fnRate)) / 2, 2), 0.4, 0.95);
  const stats: CalibrationStats = {
    sample_size: total,
    false_positive_emergency: fp,
    false_negative_emergency: fn,
    emergency_cases: emergencyCases,
    corrected_signal_cases: correctedSignalCases,
    breathing_mismatch_rate: round(breathingMismatchRate, 4),
    false_positive_rate: round(fpRate, 4),
    false_negative_rate: round(fnRate, 4),
  };

  return {
    suggested_risk_threshold: next.risk_threshold,
    suggested_confidence_threshold: next.confidence_threshold,
    suggested_breathing_boost: next.medical_boosts.breathing_issue,
    reason: reasons.join("; "),
    confidence,
    high_drift: highDrift,
    stats,
  };
}
