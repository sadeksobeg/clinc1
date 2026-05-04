import { sendViaBridge } from "@/lib/bridgeSend";
import type { MessagingPort, MessagingSendInput } from "./MessagingPort";

export class WhatsAppWebAdapter implements MessagingPort {
  async send(input: MessagingSendInput) {
    return sendViaBridge(input.to, input.text, input.policy, {
      correlationId: input.correlationId,
      clinicId: input.clinicId,
    });
  }
}

let singleton: MessagingPort | null = null;

export function getDefaultMessagingAdapter(): MessagingPort {
  if (!singleton) singleton = new WhatsAppWebAdapter();
  return singleton;
}

export function setMessagingAdapterForTests(adapter: MessagingPort | null): void {
  singleton = adapter;
}
