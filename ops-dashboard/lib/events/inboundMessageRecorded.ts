import { z } from "zod";

/** Published after inbound CRM persist (non-duplicate) for async consumers. */
export const inboundMessageRecordedSchema = z.object({
  type: z.literal("InboundMessageRecorded"),
  version: z.literal(1),
  occurred_at: z.string(),
  correlation_id: z.string(),
  clinic_id: z.number().int(),
  patient_id: z.number().int(),
  conversation_id: z.number().int(),
  inbound_message_id: z.number().int().optional(),
  dedupe_hash: z.string().optional(),
  text_preview: z.string().max(200).optional(),
});

export type InboundMessageRecorded = z.infer<typeof inboundMessageRecordedSchema>;
