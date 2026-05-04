import { describe, expect, it } from "vitest";
import {
  buildCalibrationSuggestion,
  getCurrentCalibrationThresholds,
  type CalibrationSample,
} from "./calibrationEngine";

describe("calibrationEngine", () => {
  it("returns null when samples are insufficient", () => {
    const current = getCurrentCalibrationThresholds({});
    const out = buildCalibrationSuggestion(
      [
        {
          model_decision: "EMERGENCY",
          corrected_decision: "NORMAL",
          reviewer: "ops_staff",
          note: "manual review",
          has_execution: true,
          model_signals: {},
          corrected_signals: null,
        },
      ],
      current,
    );
    expect(out).toBeNull();
  });

  it("raises thresholds for high false-positive emergency rate", () => {
    const current = getCurrentCalibrationThresholds({});
    const samples: CalibrationSample[] = Array.from({ length: 60 }).map((_, i) => ({
      model_decision: "EMERGENCY",
      corrected_decision: i < 18 ? "NORMAL" : "EMERGENCY",
      reviewer: "ops_staff",
      note: "triage correction",
      has_execution: true,
      model_signals: { breathing_issue: false },
      corrected_signals: { breathing_issue: false },
    }));
    const out = buildCalibrationSuggestion(samples, current);
    expect(out).not.toBeNull();
    expect(out?.suggested_risk_threshold).toBeGreaterThanOrEqual(current.risk_threshold);
    expect(out?.suggested_confidence_threshold).toBeGreaterThanOrEqual(current.confidence_threshold);
  });
});
