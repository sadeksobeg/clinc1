import type { Pool } from "pg";
import { getLastPatientInboundAt } from "@/lib/whatsapp/replyWindow";

const DEFAULT_EMERGENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function emergencyReplyWindowMs(): number {
  const rawMs = (process.env.EMERGENCY_REPLY_WINDOW_MS || "").trim();
  if (rawMs) {
    const n = Number.parseInt(rawMs, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const rawHours = (process.env.EMERGENCY_REPLY_WINDOW_HOURS || "").trim();
  if (rawHours) {
    const h = Number.parseInt(rawHours, 10);
    if (Number.isFinite(h) && h > 0) return h * 60 * 60 * 1000;
  }
  return DEFAULT_EMERGENCY_WINDOW_MS;
}

export type EmergencySendPolicyResult = {
  mode: "freeform" | "template_required";
  lastInboundAt: Date | null;
};

export async function resolveEmergencySendPolicy(
  pool: Pool,
  args: { clinicId: number; patientId: number },
): Promise<EmergencySendPolicyResult> {
  const lastInboundAt = await getLastPatientInboundAt(pool, args);
  if (!lastInboundAt || !Number.isFinite(lastInboundAt.getTime())) {
    return { mode: "template_required", lastInboundAt: null };
  }
  const ageMs = Date.now() - lastInboundAt.getTime();
  if (ageMs <= emergencyReplyWindowMs()) {
    return { mode: "freeform", lastInboundAt };
  }
  return { mode: "template_required", lastInboundAt };
}

export function templateRequiredMessageAr(): string {
  return "تم تصنيف الحالة كطارئة، ويجري تحويل الرسالة عبر قالب واتساب معتمد بسبب تجاوز نافذة 24 ساعة.";
}
