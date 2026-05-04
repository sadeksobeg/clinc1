import type { BridgeSendPolicy } from "@/lib/whatsapp/globalReplyPolicy";
import type { BridgeSendResult } from "@/lib/bridgeSend";

export type MessagingSendInput = {
  to: string;
  text: string;
  policy: BridgeSendPolicy;
  /** Propagated to bridge as X-Correlation-Id for log alignment */
  correlationId?: string;
  /** For P7 WhatsApp safety (per-clinic windows). */
  clinicId?: number | null;
};

/**
 * Outbound messaging abstraction (WhatsApp Web today, Cloud API later).
 */
export interface MessagingPort {
  send(input: MessagingSendInput): Promise<BridgeSendResult>;
}
