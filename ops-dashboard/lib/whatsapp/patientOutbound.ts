import type { BridgeSendResult } from "@/lib/bridgeSend";
import { getDefaultMessagingAdapter } from "@/lib/messaging/WhatsAppWebAdapter";

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
}): Promise<BridgeSendResult> {
  return getDefaultMessagingAdapter().send({
    to: args.to,
    text: args.text,
    policy: { kind: "patient_inbound_sync" },
    correlationId: args.correlationId,
  });
}
