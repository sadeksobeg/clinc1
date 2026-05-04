import type { InterpretResult } from "@/lib/scheduling/types";
import type { Decision } from "./decisionEngine";

const DIAGNOSIS_PATTERNS = [
  /\bتشخيص\b/i,
  /\bdiagnosis\b/i,
  /\bأنت مصاب\b/i,
  /\bعندك\s+(التهاب|ورم|سكري|سكر)\b/i,
  /\bthis is\s+(cancer|diabetes|covid)\b/i,
  /\byou have\s+(cancer|diabetes|pneumonia)\b/i,
];

const DRUG_PRESCRIBE_PATTERNS = [
  /\bخذ\s+(حبة|جرعة|علاج|دواء)\b/i,
  /\bجرعة\s+\d+/i,
  /\bmg\b/i,
  /\bملغ\b/i,
  /\btablet\b/i,
  /\bantibiotic\b/i,
  /\bمضاد\s+حيوي\b/i,
  /مضاد\s*حيوي/i,
  /\bوصفة\s+طبية\b/i,
  /\bprescrib/i,
  /\bdosage\b/i,
];

function scan(text: string | null | undefined, patterns: RegExp[]): string | null {
  if (!text || !text.trim()) return null;
  const t = text;
  for (const p of patterns) {
    if (p.test(t)) return p.source;
  }
  return null;
}

export type PatientSafetyGuardResult = {
  ok: boolean;
  violations: string[];
  /** Safe replacement decision when ok=false */
  handoffDecision: Decision;
};

/**
 * Blocks unsafe AI-suggested patient messaging (diagnosis / prescribing).
 * Does not replace clinical workflows; forces human review path.
 */
export function guardPatientFacingDecision(decision: Decision, interpret: InterpretResult): PatientSafetyGuardResult {
  const violations: string[] = [];
  const texts = [decision.reply_hint, interpret.reply_hint, interpret.summary].filter(Boolean) as string[];

  for (const chunk of texts) {
    const d = scan(chunk, DIAGNOSIS_PATTERNS);
    if (d) violations.push(`diagnosis_pattern:${d}`);
    const rx = scan(chunk, DRUG_PRESCRIBE_PATTERNS);
    if (rx) violations.push(`drug_pattern:${rx}`);
  }

  if (violations.length === 0) {
    return { ok: true, violations: [], handoffDecision: decision };
  }

  const handoffDecision: Decision = {
    type: decision.type === "EMERGENCY" ? "EMERGENCY" : "UNKNOWN",
    actions: ["PRIORITIZE"],
    priority: Math.max(decision.priority, 90),
    reason: `patient_safety_guard:${violations.slice(0, 3).join("|")}`,
    reply_hint: null,
  };

  return { ok: false, violations, handoffDecision };
}
