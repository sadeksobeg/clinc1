/**
 * Inbound queue worker v2:
 * - Pre-ingest: Redis list `inbound:deferred` (v1 jobs) → full `processInboundMessage` (sender lock was contended before CRM).
 * - Post-ingest: per-conversation FIFO + fast/slow lanes + `inbound:processing` visibility lease, stale reclaim + DLQ.
 * - v4: micro-batch peek+trim (same lane), optional domain_events / outbound write buffers flushed on each loop.
 *
 * Env: DATABASE_URL, REDIS_URL, INBOUND_POST_INGEST_LEASE_MS, INBOUND_POST_INGEST_MAX_RETRIES,
 *      INBOUND_DEFERRED_BRPOP_SEC (pre-ingest BRPOP timeout), INBOUND_WORKER_IDLE_SEC (post-ingest BLMOVE timeout per conv),
 *      INBOUND_PROCESSING_SHARDS, INBOUND_WORKER_SHARD_START/END, INBOUND_FAIR_PATTERN (see docs/REDIS_INBOUND_QUEUE_OPS.md).
 *      INBOUND_CONV_MICRO_BATCH_MAX, INBOUND_MICRO_BATCH_TEXT_MODE (concat|last|smart_last),
 *      INBOUND_DOMAIN_EVENTS_REDIS_BUFFER, INBOUND_OUTBOUND_DB_WRITE_BUFFER,
 *      INBOUND_WRITE_BUFFER_SPILL_PATH, INBOUND_WRITE_BUFFER_SPILL_DUAL_WRITE,
 *      INBOUND_AI_CONV_RATE_LIMIT, INBOUND_AI_PER_CONV_MIN_INTERVAL_MS, INBOUND_AI_TOKEN_BUCKET,
 *      INBOUND_STALE_REQUEUE_MAX, INBOUND_SPILL_STAT_INTERVAL_MS, INBOUND_SPILL_WARN_BYTES,
 *      INBOUND_PREFETCH_CLINIC_SCHEDULE, INBOUND_SLA_HIGH_PRIORITY_CLINIC_IDS
 *
 * Run: npx tsx scripts/inbound-deferred-worker.ts
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("./load-ops-env.cjs");

import { getPool } from "../lib/db";
import { flushDomainEventWriteBuffer } from "../lib/db/domainEventWriteBuffer";
import { flushOutboundMessageWriteBuffer } from "../lib/db/outboundMessageWriteBuffer";
import { getTotalSpillBytesApprox } from "../lib/db/writeBufferSpill";
import {
  blockingPopDeferredInboundJob,
  claimNextPostIngestJob,
  ackPostIngestProcessing,
  requeueStaleInboundProcessing,
  defaultInboundLeaseMs,
  defaultStaleRequeueMax,
  peekPostIngestTailJobLines,
  softRequeueStalePostIngestJob,
  trimPostIngestConvLaneLeft,
  replacePostIngestProcessingHeadIfUnchanged,
} from "../lib/messaging/inboundDeferredQueue";
import { parsePostIngestJobV2 } from "../lib/messaging/inboundDeferredJobV2";
import { inboundMicroBatchMaxTotal, parseAndMergePeekedTail, reapplyLease } from "../lib/messaging/postIngestMicroBatch";
import { isDeferredPostIngestStale } from "../lib/messaging/deferredPostIngestStale";
import { incProductMetric } from "../lib/observability/productMetrics";
import {
  processInboundMessage,
  processInboundPostIngestFromDeferredJob,
  type ProcessInboundInput,
} from "../lib/conversations/processInbound";

function spillStatIntervalMs(): number {
  const n = Number(process.env.INBOUND_SPILL_STAT_INTERVAL_MS || 60_000);
  return Number.isFinite(n) && n >= 5_000 && n <= 3_600_000 ? Math.floor(n) : 60_000;
}

function spillWarnBytes(): number {
  const n = Number(process.env.INBOUND_SPILL_WARN_BYTES || 5_000_000);
  return Number.isFinite(n) && n >= 100_000 ? Math.floor(n) : 5_000_000;
}

async function main(): Promise<void> {
  const pool = getPool();
  let lastSpillStatAt = 0;
  const preTimeout = Math.min(60, Math.max(1, Number(process.env.INBOUND_DEFERRED_BRPOP_SEC || 5) || 5));
  const idleSec = Math.min(30, Math.max(1, Number(process.env.INBOUND_WORKER_IDLE_SEC || 2) || 2));
  const leaseMs = defaultInboundLeaseMs();
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      component: "inbound_deferred_worker_v2",
      message: "started",
      pre_ingest_brpop_sec: preTimeout,
      post_ingest_blmove_sec: idleSec,
      lease_ms: leaseMs,
    }),
  );

  for (;;) {
    const nowLoop = Date.now();
    if (nowLoop - lastSpillStatAt >= spillStatIntervalMs()) {
      lastSpillStatAt = nowLoop;
      const spillBytes = await getTotalSpillBytesApprox().catch(() => 0);
      const warnB = spillWarnBytes();
      if (spillBytes > warnB) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: "warn",
            component: "write_buffer_spill",
            message: "spill_bytes_above_threshold",
            spill_bytes: spillBytes,
            warn_bytes: warnB,
          }),
        );
      }
    }

    const { requeued, dead } = await requeueStaleInboundProcessing();
    if (requeued) incProductMetric("process_inbound_stale_reclaimed_total", requeued);
    if (dead) incProductMetric("process_inbound_dlq_total", dead);

    void flushDomainEventWriteBuffer(pool, 40).catch(() => undefined);
    void flushOutboundMessageWriteBuffer(pool, 20).catch(() => undefined);

    const claimed = await claimNextPostIngestJob(leaseMs, idleSec);
    if (claimed) {
      let leasedStr = claimed.leasedStr;
      let job = parsePostIngestJobV2(JSON.parse(leasedStr));
      if (!job) {
        await ackPostIngestProcessing(leasedStr);
        continue;
      }
      if (await isDeferredPostIngestStale(pool, job)) {
        const maxStale = defaultStaleRequeueMax();
        if ((job.stale_requeue_count ?? 0) >= maxStale) {
          incProductMetric("process_inbound_deferred_stale_drop_total");
          await ackPostIngestProcessing(leasedStr);
          continue;
        }
        const requeuedOk = await softRequeueStalePostIngestJob(pool, job);
        if (requeuedOk) {
          incProductMetric("process_inbound_deferred_stale_requeue_total");
          await ackPostIngestProcessing(leasedStr);
        } else {
          incProductMetric("process_inbound_deferred_stale_drop_total");
          await ackPostIngestProcessing(leasedStr);
        }
        continue;
      }
      const maxTotal = inboundMicroBatchMaxTotal();
      const maxExtra = Math.max(0, maxTotal - 1);
      let tailLines: string[] = [];
      if (maxExtra > 0) {
        tailLines = await peekPostIngestTailJobLines(job.conversation_id, claimed.lane, maxExtra);
      }
      const { job: mergedJob, consumedTailCount } = parseAndMergePeekedTail(job, tailLines);
      let tailUsed = 0;
      if (consumedTailCount > 0) {
        const { job: leasedJob, leasedStr: nextStr } = reapplyLease(mergedJob, leaseMs);
        const ok = await replacePostIngestProcessingHeadIfUnchanged(job.conversation_id, leasedStr, nextStr);
        if (ok) {
          leasedStr = nextStr;
          job = leasedJob;
          tailUsed = consumedTailCount;
          incProductMetric("process_inbound_micro_batch_merged_total", tailUsed);
          incProductMetric("process_inbound_micro_batch_messages_total", 1 + tailUsed);
          incProductMetric("process_inbound_micro_batch_run_total");
        }
      }
      try {
        await processInboundPostIngestFromDeferredJob(pool, job);
        if (tailUsed > 0) {
          await trimPostIngestConvLaneLeft(job.conversation_id, claimed.lane, tailUsed);
        }
        incProductMetric("process_inbound_post_ingest_worker_success_total");
      } catch (e) {
        incProductMetric("process_inbound_post_ingest_worker_error_total");
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: "error",
            component: "inbound_deferred_worker_v2",
            phase: "post_ingest",
            conversation_id: job.conversation_id,
            message: e instanceof Error ? e.message : String(e),
          }),
        );
      } finally {
        await ackPostIngestProcessing(leasedStr);
      }
      continue;
    }

    const pre = await blockingPopDeferredInboundJob(preTimeout);
    if (!pre) continue;
    try {
      await processInboundMessage(pool, pre.payload as ProcessInboundInput, {});
    } catch (e) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          component: "inbound_deferred_worker_v2",
          phase: "pre_ingest",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
}

void main();
