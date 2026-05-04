import { createHash } from "crypto";

/** Stable id for InboundMessageRecorded / idempotency (same logical inbound → same id). */
export function computeInboundEventId(args: {
  clinic_id: number;
  conversation_id: number;
  dedupe_hash: string | null | undefined;
  inbound_message_id: number | null | undefined;
  message_id?: string | null;
}): string {
  const parts = [
    String(args.clinic_id),
    String(args.conversation_id),
    args.dedupe_hash || "",
    args.inbound_message_id != null ? String(args.inbound_message_id) : "",
    args.message_id || "",
  ].join("|");
  return createHash("sha256").update(parts, "utf8").digest("hex");
}
