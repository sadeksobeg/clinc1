/**
 * Phase A: fan-out consumer — does NOT re-run processInbound / booking logic.
 * Claims from Redis stream, idempotency via processed_events, optional DLQ on hard failure.
 */
import { createClient } from "redis";
import pg from "pg";
import { isFatalPgOrPayloadError } from "./classifyError.js";

const STREAM = process.env.REDIS_EVENTS_STREAM || "ops:events:inbound";
const GROUP = process.env.REDIS_CONSUMER_GROUP || "ops-core";
const CONSUMER = process.env.REDIS_CONSUMER_NAME || `ec-${process.pid}`;
const REDIS_URL = (process.env.REDIS_URL || "").trim();
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const MAX_ATTEMPTS = Number(process.env.EVENT_DLQ_AFTER_ATTEMPTS || 3);

function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), component: "event_consumer", ...obj }));
}

async function ensureGroup(redis) {
  try {
    await redis.xGroupCreate(STREAM, GROUP, "0", { MKSTREAM: true });
    log({ message: "xgroup_created", stream: STREAM, group: GROUP });
  } catch (e) {
    if (String(e?.message || e).includes("BUSYGROUP")) return;
    throw e;
  }
}

async function tryClaimProcessed(pool, { event_id, stream_id, event_type, clinic_id, conversation_id, payload_hash }) {
  const r = await pool.query(
    `INSERT INTO processed_events (event_id, stream_id, event_type, clinic_id, conversation_id, payload_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [event_id, stream_id, event_type, clinic_id, conversation_id, payload_hash],
  );
  return r.rowCount === 1;
}

async function insertDlq(pool, { stream_id, event_id, event_type, payload, reason, attempts }) {
  await pool.query(
    `INSERT INTO dead_letter_events (stream_id, event_id, event_type, payload, reason, attempts)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [stream_id, event_id, event_type, JSON.stringify(payload), reason.slice(0, 2000), attempts],
  );
}

function routeEventPhaseA(payload) {
  if (payload?.type !== "InboundMessageRecorded") {
    log({ message: "fanout_skip_unknown_type", type: payload?.type });
    return;
  }
  log({
    message: "fanout_inbound_recorded",
    event_id: payload.event_id,
    clinic_id: payload.clinic_id,
    conversation_id: payload.conversation_id,
    correlation_id: payload.correlation_id,
  });
}

async function main() {
  if (!REDIS_URL) throw new Error("REDIS_URL is required");
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

  const redis = createClient({ url: REDIS_URL });
  redis.on("error", (err) => log({ level: "error", message: "redis_client_error", detail: err.message }));
  await redis.connect();

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  await ensureGroup(redis);

  log({ message: "consumer_started", stream: STREAM, group: GROUP, consumer: CONSUMER });

  for (;;) {
    let batch;
    try {
      batch = await redis.xReadGroup(
        GROUP,
        CONSUMER,
        { key: STREAM, id: ">" },
        { COUNT: 25, BLOCK: 10_000 },
      );
    } catch (e) {
      log({ level: "error", message: "xreadgroup_failed", detail: String(e?.message || e) });
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    if (!batch?.length) continue;

    for (const stream of batch) {
      for (const msg of stream.messages) {
        const streamId = msg.id;
        const raw = msg.message?.payload;
        let payload;
        try {
          payload = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw));
        } catch (e) {
          await insertDlq(pool, {
            stream_id: streamId,
            event_id: null,
            event_type: "parse_error",
            payload: { raw: String(raw).slice(0, 4000) },
            reason: String(e?.message || e),
            attempts: MAX_ATTEMPTS,
          });
          await redis.xAck(STREAM, GROUP, streamId);
          continue;
        }

        const event_id = payload.event_id || payload.eventId;
        if (!event_id) {
          await insertDlq(pool, {
            stream_id: streamId,
            event_id: null,
            event_type: String(payload.type || "unknown"),
            payload,
            reason: "missing_event_id",
            attempts: MAX_ATTEMPTS,
          });
          await redis.xAck(STREAM, GROUP, streamId);
          continue;
        }

        const payloadHash =
          typeof raw === "string" ? String(raw).slice(0, 128) : JSON.stringify(payload).slice(0, 128);

        let attempt = 0;
        for (;;) {
          try {
            const firstTime = await tryClaimProcessed(pool, {
              event_id,
              stream_id: streamId,
              event_type: String(payload.type || "unknown"),
              clinic_id: payload.clinic_id ?? null,
              conversation_id: payload.conversation_id ?? null,
              payload_hash: payloadHash,
            });

            if (firstTime) {
              routeEventPhaseA(payload);
            } else {
              log({ message: "duplicate_event_skip", event_id, stream_id: streamId });
            }
            await redis.xAck(STREAM, GROUP, streamId);
            break;
          } catch (e) {
            if (isFatalPgOrPayloadError(e)) {
              log({
                level: "error",
                message: "handler_fatal_dlq",
                event_id,
                detail: String(e?.message || e),
                code: e && typeof e === "object" && "code" in e ? e.code : undefined,
              });
              await insertDlq(pool, {
                stream_id: streamId,
                event_id,
                event_type: String(payload.type || "unknown"),
                payload,
                reason: `fatal:${String(e?.message || e)}`.slice(0, 2000),
                attempts: MAX_ATTEMPTS,
              }).catch(() => undefined);
              await redis.xAck(STREAM, GROUP, streamId);
              break;
            }
            attempt += 1;
            log({ level: "error", message: "handler_failed", event_id, attempt, detail: String(e?.message || e) });
            if (attempt >= MAX_ATTEMPTS) {
              await insertDlq(pool, {
                stream_id: streamId,
                event_id,
                event_type: String(payload.type || "unknown"),
                payload,
                reason: String(e?.message || e),
                attempts: attempt,
              }).catch(() => undefined);
              await redis.xAck(STREAM, GROUP, streamId);
              break;
            }
            await new Promise((r) => setTimeout(r, Math.min(5000, 250 * 2 ** (attempt - 1))));
          }
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
