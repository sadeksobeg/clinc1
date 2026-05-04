import type { BridgeSendResult } from "@/lib/bridgeSend";
import { getDefaultMessagingAdapter } from "@/lib/messaging/WhatsAppWebAdapter";
import { guardOutboundPatientText } from "@/lib/conversations/outboundMessageGuard";

export type PatientSendContext = "inbound_sync_reply";

/**
 * Patient-facing WhatsApp send in the same request as a fresh inbound message.
 * Proactive sends use the outbox worker with `patient_proactive` policy.
 */
export async function sendPatientWhatsApp(args: {
  to: string;
  text: string;
  context: PatientSendContext;
  correlationId?: string;
  clinicId?: number | null;
}): Promise<BridgeSendResult> {
  return getDefaultMessagingAdapter().send({
    to: args.to,
    text: args.text,
    policy: { kind: "patient_inbound_sync" },
    correlationId: args.correlationId,
    clinicId: args.clinicId,
  });
}

/** P7: validates length / forbidden content before patient-visible send. */
export async function sendPatientWhatsAppGuarded(args: {
  to: string;
  text: string;
  context: PatientSendContext;
  correlationId?: string;
  clinicId: number;
  conversationId?: number | null;
}): Promise<BridgeSendResult> {
  const g = await guardOutboundPatientText({
    text: args.text,
    clinicId: args.clinicId,
    conversationId: args.conversationId ?? null,
    source: args.context,
  });
  if (g.action === "block") {
    return { ok: false, detail: `outbound_guard:${g.reason}` };
  }
  const text = g.action === "sanitize" ? g.text : g.text;
  return sendPatientWhatsApp({
    to: args.to,
    text,
    context: args.context,
    correlationId: args.correlationId,
    clinicId: args.clinicId,
  });
}
