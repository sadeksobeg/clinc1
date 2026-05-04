import type { InterpretResult } from "@/lib/scheduling/types";
import { interpretInboundText } from "@/lib/scheduling/interpret";
import { extractBookingEntities, type BookingEntityExtract } from "./bookingEntityExtract";

export type ClassifyAndExtractResult = {
  interpret: InterpretResult;
  booking: BookingEntityExtract;
};

/**
 * Single inbound pass: intent/specialty (interpret) + booking entity hints (extract).
 * Both may call Ollama when `OLLAMA_URL` is set; interpret falls back to heuristics on failure.
 */
export async function classifyAndExtractInbound(patientText: string): Promise<ClassifyAndExtractResult> {
  const [interpret, booking] = await Promise.all([
    interpretInboundText(patientText),
    extractBookingEntities(patientText),
  ]);
  return { interpret, booking };
}
