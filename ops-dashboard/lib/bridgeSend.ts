import type { BridgeSendPolicy } from "@/lib/whatsapp/globalReplyPolicy";
import { canSendWhatsAppBridge } from "@/lib/whatsapp/globalReplyPolicy";

export type BridgeSendResult = { ok: true } | { ok: false; detail: string };

export type SendViaBridgeOptions = {
  correlationId?: string;
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
  const gate = canSendWhatsAppBridge(policy);
  if (!gate.ok) {
    return { ok: false, detail: gate.detail };
  }
  const base = (process.env.BRIDGE_INTERNAL_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
  const token = (process.env.BRIDGE_SEND_TOKEN || "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const cid = (opts?.correlationId || "").trim();
  if (cid) headers["X-Correlation-Id"] = cid.slice(0, 256);
  const res = await fetch(`${base}/send`, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, text }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    return { ok: false, detail: bodyText.slice(0, 800) };
  }
  return { ok: true };
}
