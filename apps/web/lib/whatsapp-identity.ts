import { extractWhatsAppDigits } from "@/lib/format";

/**
 * Canonical WhatsApp identity for comparison / dedup (digits only).
 * Use instead of raw `chat_id` in comparisons when possible.
 */
export function normalizeWhatsAppChatId(chatId: string | null | undefined): string | null {
  return extractWhatsAppDigits(chatId);
}
