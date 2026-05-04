import { z } from "zod";

export const inboundQueuePrioritySchema = z.enum(["high", "normal", "low"]);
export type InboundQueuePriority = z.infer<typeof inboundQueuePrioritySchema>;

export const normalizedInboundRulesSnapshotSchema = z.object({
  from: z.string(),
  to: z.string(),
  text: z.string(),
  messageId: z.string(),
  receivedAt: z.string(),
  outsideHours: z.boolean(),
  alertTo: z.string(),
  dedupeHash: z.string(),
  ruleIntent: z.enum(["GENERAL", "URGENT", "BOOKING", "PRICING"]),
  rulePriority: z.number(),
  ruleHandoff: z.boolean(),
  fallbackReply: z.string(),
  clinic_id: z.number(),
  workflowStartedAt: z.number(),
});

export const inboundIngestRowSnapshotSchema = z.object({
  is_duplicate: z.boolean(),
  clinic_id: z.number(),
  patient_id: z.number(),
  patient_status: z.string(),
  patient_display_name: z.string().nullable(),
  conversation_id: z.number(),
  inbound_message_id: z.number(),
  conversation_state: z.string(),
  from: z.string(),
  text: z.string(),
  ruleIntent: z.string(),
  rulePriority: z.number(),
  ruleHandoff: z.boolean(),
  fallbackReply: z.string(),
  outsideHours: z.boolean(),
  receivedAt: z.string(),
  alertTo: z.string(),
  dedupeHash: z.string(),
  workflow_latency_ms: z.number(),
});

export const postIngestLaneSchema = z.enum(["fast", "slow"]);
export type PostIngestLane = z.infer<typeof postIngestLaneSchema>;

export const postIngestJobV2Schema = z.object({
  v: z.literal(2),
  skip_ingest: z.literal(true),
  /** When absent, requeue/compat uses legacy per-conversation list `queue:inbound:conv:{id}`. */
  lane: postIngestLaneSchema.optional(),
  conversation_id: z.number(),
  clinic_id: z.number(),
  patient_id: z.number(),
  inbound_message_id: z.number(),
  dedupeHash: z.string(),
  from: z.string(),
  text: z.string(),
  crm: inboundIngestRowSnapshotSchema,
  norm: normalizedInboundRulesSnapshotSchema,
  rawFlags: z.object({
    execute_send: z.boolean().optional(),
    send_urgent_alert: z.boolean().optional(),
    enqueue_on_bridge_failure: z.boolean().optional(),
  }),
  correlationId: z.string().optional(),
  priority: inboundQueuePrioritySchema,
  retry_count: z.number().int().min(0),
  first_enqueued_at: z.string(),
  enqueued_at: z.string(),
  /** Set while the job sits in `inbound:processing` (worker-owned). */
  claimed_at: z.number().optional(),
  lease_until: z.number().optional(),
  /** `conversations.dialogue_version` at enqueue; worker skips if DB version is greater (fast/slow race). */
  dialogue_version_snapshot: z.number().int().min(0).optional(),
  /** Count of soft requeues after stale dialogue detection (bounded by env). */
  stale_requeue_count: z.number().int().min(0).optional(),
});

export type PostIngestJobV2 = z.infer<typeof postIngestJobV2Schema>;

export function parsePostIngestJobV2(raw: unknown): PostIngestJobV2 | null {
  const r = postIngestJobV2Schema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Map normalized rules intent to cross-conversation queue priority (per plan §4). */
export function queuePriorityFromNorm(ruleIntent: string): InboundQueuePriority {
  if (ruleIntent === "URGENT") return "high";
  if (ruleIntent === "PRICING") return "low";
  return "normal";
}

export function priorityRank(p: InboundQueuePriority): number {
  if (p === "high") return 1;
  if (p === "normal") return 2;
  return 3;
}

/** Optional SLA override: comma-separated clinic ids → always `high` queue priority for deferred post-ingest. */
export function inboundSlaHighPriorityClinicIds(): Set<number> {
  const raw = (process.env.INBOUND_SLA_HIGH_PRIORITY_CLINIC_IDS || "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
}

export function queuePriorityWithSla(clinicId: number, base: InboundQueuePriority): InboundQueuePriority {
  return inboundSlaHighPriorityClinicIds().has(clinicId) ? "high" : base;
}

/**
 * Fast lane: interactive FSM / urgent / no-AI / short booking heuristics.
 * Slow lane: likely Ollama interpret path.
 */
export function inferPostIngestLane(args: {
  ruleIntent: string;
  textLength: number;
  flowStep: string;
}): PostIngestLane {
  const ollama = Boolean((process.env.OLLAMA_URL || "").trim());
  if (args.ruleIntent === "URGENT") return "fast";
  if (args.flowStep !== "idle") return "fast";
  if (!ollama) return "fast";
  if (args.ruleIntent === "BOOKING" && args.textLength < 200) return "fast";
  return "slow";
}

/** Stable JSON for Redis LREM matching (fixed key order). */
export function serializePostIngestJobV2(job: PostIngestJobV2): string {
  const o = {
    v: 2 as const,
    skip_ingest: true as const,
    ...(job.lane !== undefined ? { lane: job.lane } : {}),
    ...(job.dialogue_version_snapshot !== undefined
      ? { dialogue_version_snapshot: job.dialogue_version_snapshot }
      : {}),
    ...(job.stale_requeue_count !== undefined ? { stale_requeue_count: job.stale_requeue_count } : {}),
    conversation_id: job.conversation_id,
    clinic_id: job.clinic_id,
    patient_id: job.patient_id,
    inbound_message_id: job.inbound_message_id,
    dedupeHash: job.dedupeHash,
    from: job.from,
    text: job.text,
    crm: { ...job.crm },
    norm: { ...job.norm },
    rawFlags: { ...job.rawFlags },
    correlationId: job.correlationId,
    priority: job.priority,
    retry_count: job.retry_count,
    first_enqueued_at: job.first_enqueued_at,
    enqueued_at: job.enqueued_at,
    claimed_at: job.claimed_at,
    lease_until: job.lease_until,
  };
  return JSON.stringify(o);
}
