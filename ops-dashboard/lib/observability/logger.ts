import { captureErrorAggregation, writeStructuredLog } from "@/lib/observability/trace";
import { type StructuredLogEnvelope } from "@/lib/observability/envelope";

export async function persistEnvelopeLog(envelope: StructuredLogEnvelope): Promise<void> {
  await writeStructuredLog({
    level: envelope.level,
    eventName: envelope.event_name,
    requestId: envelope.request_id,
    traceId: envelope.trace_id,
    clinicId: envelope.clinic_id,
    userId: envelope.user_id,
    jobId: envelope.job_id,
    entityId: envelope.entity_id,
    message: envelope.message,
    payload: {
      source_app: envelope.source_app,
      ...envelope.payload,
    },
  });
}

export async function persistErrorEnvelope(args: StructuredLogEnvelope & { sampleError: string }): Promise<void> {
  await Promise.all([
    persistEnvelopeLog({ ...args, level: "error" }),
    captureErrorAggregation({
      severity: "high",
      sampleError: args.sampleError,
      samplePayload: args.payload,
    }),
  ]);
}
