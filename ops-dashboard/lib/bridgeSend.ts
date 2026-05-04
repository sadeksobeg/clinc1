import type { BridgeSendPolicy } from "@/lib/whatsapp/globalReplyPolicy";
import { canSendWhatsAppBridge } from "@/lib/whatsapp/globalReplyPolicy";
import { acquireGlobalBridgeSendSlot } from "@/lib/messaging/globalSendThrottle";
import { getRuntimeFlag } from "@/lib/system/emergencyMode";
import {
  acquireWhatsAppSafetySlots,
  recordBridgeSendOutcome,
  sleepHumanLikeJitter,
} from "@/lib/whatsapp/whatsappSafetyLayer";

export type BridgeSendResult = { ok: true } | { ok: false; detail: string };

export type SendViaBridgeOptions = {
  correlationId?: string;
  /** When set, enables per-clinic P7 safety windows (patient sends). */
  clinicId?: number | null;
};

/**
 * All server-side calls to the WhatsApp bridge must go through this function.
 * @param policy Required: who/why this send is allowed (reactive / staff alert).
 */
export async function sendViaBridge(
  to: string,
  text: string,
  policy: BridgeSendPolicy,
  opts?: SendViaBridgeOptions,
): Promise<BridgeSendResult> {
  if (policy.kind !== "staff_alert") {
    const runtimeBlocked = await getRuntimeFlag("whatsapp_send_disabled");
    if (runtimeBlocked) {
      return { ok: false, detail: "runtime_whatsapp_send_disabled" };
    }
  }
  const gate = canSendWhatsAppBridge(policy);
  if (!gate.ok) {
    return { ok: false, detail: gate.detail };
  }
  try {
    await acquireWhatsAppSafetySlots({
      clinicId: opts?.clinicId ?? null,
      policyKind: policy.kind,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "wa_safety_rate_limited") {
      return { ok: false, detail: "wa_safety_rate_limited" };
    }
    return { ok: false, detail: `wa_safety_gate_error:${msg.slice(0, 200)}` };
  }
  await acquireGlobalBridgeSendSlot();
  await sleepHumanLikeJitter(policy.kind);
  const base = (process.env.BRIDGE_INTERNAL_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
  const token = (process.env.BRIDGE_SEND_TOKEN || "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const cid = (opts?.correlationId || "").trim();
  if (cid) headers["X-Correlation-Id"] = cid.slice(0, 256);
  try {
    const res = await fetch(`${base}/send`, {
      method: "POST",
      headers,
      body: JSON.stringify({ to, text }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      await recordBridgeSendOutcome({
        ok: false,
        clinicId: opts?.clinicId ?? null,
        policyKind: policy.kind,
        detail: bodyText.slice(0, 800),
      });
      return { ok: false, detail: bodyText.slice(0, 800) };
    }
    await recordBridgeSendOutcome({
      ok: true,
      clinicId: opts?.clinicId ?? null,
      policyKind: policy.kind,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordBridgeSendOutcome({
      ok: false,
      clinicId: opts?.clinicId ?? null,
      policyKind: policy.kind,
      detail: `fetch_error:${msg.slice(0, 400)}`,
    });
    return { ok: false, detail: `fetch_error:${msg.slice(0, 400)}` };
  }
}
