import { isRecentPatientInbound, patientReplyWindowMs } from "./replyWindow";
import { opsLog } from "@/lib/opsLog";
import { incProductMetric } from "@/lib/observability/productMetrics";

export type BridgeSendPolicy =
  | { kind: "patient_inbound_sync" }
  | { kind: "patient_proactive"; lastInboundAt: Date | null }
  | { kind: "staff_alert" };

/** When true, blocks all patient-facing WhatsApp; staff alerts still allowed. */
export function whatsappKillSwitchActive(): boolean {
  return String(process.env.WHATSAPP_KILL_SWITCH || "").toLowerCase() === "true";
}

let metricsBlocked = 0;
let metricsAllowed = 0;
let metricsOutOfWindow = 0;

export function resetWaPolicyMetricsForTests(): void {
  metricsBlocked = 0;
  metricsAllowed = 0;
  metricsOutOfWindow = 0;
}

export function getWaPolicyMetrics(): {
  blocked_outbound_messages: number;
  allowed_outbound_messages: number;
  out_of_window_attempts: number;
} {
  return {
    blocked_outbound_messages: metricsBlocked,
    allowed_outbound_messages: metricsAllowed,
    out_of_window_attempts: metricsOutOfWindow,
  };
}

/**
 * Central gate for ops-dashboard → bridge sends.
 * - `staff_alert`: urgent line to staff (bypasses patient reply window; not blocked by kill switch).
 * - `patient_inbound_sync`: same HTTP cycle as a fresh inbound row (always allow unless kill blocks patient paths).
 * - `patient_proactive`: requires recent `lastInboundAt` inside PATIENT_REPLY_WINDOW_*.
 */
export function canSendWhatsAppBridge(policy: BridgeSendPolicy): { ok: true } | { ok: false; detail: string } {
  if (policy.kind === "staff_alert") {
    metricsAllowed += 1;
    return { ok: true };
  }

  if (whatsappKillSwitchActive()) {
    metricsBlocked += 1;
    incProductMetric("bridge_send_blocked_policy_total");
    opsLog("warn", "whatsapp_policy", "blocked_kill_switch", { policy: policy.kind });
    return { ok: false, detail: "kill_switch" };
  }

  if (policy.kind === "patient_inbound_sync") {
    metricsAllowed += 1;
    return { ok: true };
  }

  if (policy.kind === "patient_proactive") {
    if (!policy.lastInboundAt || !Number.isFinite(policy.lastInboundAt.getTime())) {
      metricsBlocked += 1;
      incProductMetric("bridge_send_blocked_policy_total");
      opsLog("warn", "whatsapp_policy", "blocked_no_last_inbound", {});
      return { ok: false, detail: "no_last_inbound" };
    }
    if (!isRecentPatientInbound(policy.lastInboundAt)) {
      metricsOutOfWindow += 1;
      metricsBlocked += 1;
      incProductMetric("bridge_send_blocked_policy_total");
      opsLog("warn", "whatsapp_policy", "blocked_outside_reply_window", {
        window_ms: patientReplyWindowMs(),
      });
      return { ok: false, detail: "outside_reply_window" };
    }
    metricsAllowed += 1;
    return { ok: true };
  }

  metricsBlocked += 1;
  incProductMetric("bridge_send_blocked_policy_total");
  return { ok: false, detail: "unknown_policy" };
}
