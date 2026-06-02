import type { BridgeSendPolicy } from "@/lib/whatsapp/globalReplyPolicy";
import { canSendWhatsAppBridge } from "@/lib/whatsapp/globalReplyPolicy";
import { acquireGlobalBridgeSendSlot } from "@/lib/messaging/globalSendThrottle";
import { getRuntimeFlag } from "@/lib/system/emergencyMode";
import {
  acquireWhatsAppSafetySlots,
  recordBridgeSendOutcome,
  sleepHumanLikeJitter,
} from "@/lib/whatsapp/whatsappSafetyLayer";
import { opsLogError } from "@/lib/opsLog";

export type BridgeSendResult = { ok: true } | { ok: false; detail: string };

export type SendViaBridgeOptions = {
  correlationId?: string;
  /** When set, enables per-clinic P7 safety windows (patient sends). */
  clinicId?: number | null;
};

function bridgeSendRoots(): string[] {
  const base = (process.env.BRIDGE_INTERNAL_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
  const fallback = (process.env.BRIDGE_INTERNAL_FALLBACK_URL || "").replace(/\/$/, "").trim();
  const roots = [...new Set([base, fallback].filter((x) => x.length > 0))];
  return roots.length > 0 ? roots : ["http://127.0.0.1:3100"];
}

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
  const roots = bridgeSendRoots();
  const timeoutMs = Number(process.env.BRIDGE_SEND_TIMEOUT_MS || 5000);
  const sendTimeout =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60_000 ? timeoutMs : 5000;
  const token = (process.env.BRIDGE_SEND_TOKEN || "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const cid = (opts?.correlationId || "").trim();
  if (cid) headers["X-Correlation-Id"] = cid.slice(0, 256);
  let lastDetail = "bridge_unreachable";
  for (const base of roots) {
    try {
      const res = await fetch(`${base}/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({ to, text }),
        signal: AbortSignal.timeout(sendTimeout),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        lastDetail = bodyText.slice(0, 800);
        continue;
      }
      await recordBridgeSendOutcome({
        ok: true,
        clinicId: opts?.clinicId ?? null,
        policyKind: policy.kind,
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastDetail = `fetch_error:${msg.slice(0, 400)}`;
      opsLogError("bridgeSend.sendViaBridge", e, {
        bridge_url: base,
        to: String(to).slice(0, 32),
        policy_kind: policy.kind,
        timeout_ms: sendTimeout,
      });
    }
  }
  const detail =
    roots.length > 1 ? `${lastDetail} (tried: ${roots.join(" | ")})` : lastDetail;
  await recordBridgeSendOutcome({
    ok: false,
    clinicId: opts?.clinicId ?? null,
    policyKind: policy.kind,
    detail,
  });
  return { ok: false, detail };
}
