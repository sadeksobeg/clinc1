import type { RedisClientType } from "@redis/client";
import { createClient } from "redis";
import type { Pool } from "pg";

export type DeepHealthStatus = "ok" | "degraded" | "down";

export type DeepHealthReport = {
  status: DeepHealthStatus;
  checked_at: string;
  db: { ok: boolean; latency_ms?: number; error?: string };
  redis: { ok: boolean; latency_ms?: number; error?: string; stream?: string; groups?: unknown };
  bridge: { ok: boolean; latency_ms?: number; status?: number; error?: string };
  /** Alias for `stream_lag_ms` (plan / LB probes). */
  lag_ms: number | null;
  stream_lag_ms: number | null;
  pending_count: number | null;
  /** Rows in `dead_letter_events` in the last 5 minutes (0 if table missing / query failed). */
  dead_letter_events_5m: number | null;
  /** True when `dead_letter_events_5m` >= `DEAD_LETTER_ALERT_THRESHOLD` (default 5). */
  dead_letter_spike: boolean;
};

const STREAM = (process.env.REDIS_EVENTS_STREAM || "ops:events:inbound").trim();
const GROUP = (process.env.REDIS_CONSUMER_GROUP || "ops-core").trim();

const DEAD_LETTER_ALERT_THRESHOLD = Math.max(1, Number(process.env.DEAD_LETTER_ALERT_THRESHOLD || 5));

function formatFetchError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts: string[] = [e.message];
  let c: unknown = e.cause;
  let depth = 0;
  while (depth < 5) {
    if (c instanceof Error) {
      parts.push(c.message);
      c = c.cause;
      depth++;
      continue;
    }
    if (c && typeof c === "object" && "code" in c) {
      parts.push(`code=${String((c as { code?: unknown }).code)}`);
    }
    break;
  }
  return parts.filter(Boolean).join(" — ");
}

/** Exported for tests — Redis stream IDs are `<unix-ms>-<seq>`. */
export function streamEntryLagMs(streamId: string | undefined, nowMs = Date.now()): number | null {
  if (!streamId) return null;
  const ms = Number(streamId.split("-")[0]);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, nowMs - ms);
}

export async function runDeepHealth(pool: Pool): Promise<DeepHealthReport> {
  const checked_at = new Date().toISOString();
  const db = { ok: false as boolean, latency_ms: undefined as number | undefined, error: undefined as string | undefined };
  const redis = {
    ok: false as boolean,
    latency_ms: undefined as number | undefined,
    error: undefined as string | undefined,
    stream: STREAM,
    groups: undefined as unknown,
  };
  const bridge = {
    ok: false as boolean,
    latency_ms: undefined as number | undefined,
    status: undefined as number | undefined,
    error: undefined as string | undefined,
  };
  let stream_lag_ms: number | null = null;
  let pending_count: number | null = null;
  let dead_letter_events_5m: number | null = null;

  const tDb = Date.now();
  try {
    await pool.query("SELECT 1 AS ok");
    db.ok = true;
    db.latency_ms = Date.now() - tDb;
  } catch (e) {
    db.error = e instanceof Error ? e.message : String(e);
  }

  if (db.ok) {
    try {
      const dl = await pool.query(
        `SELECT COUNT(*)::int AS n FROM dead_letter_events WHERE created_at > NOW() - INTERVAL '5 minutes'`,
      );
      dead_letter_events_5m = Number(dl.rows[0]?.n ?? 0);
    } catch {
      dead_letter_events_5m = null;
    }
  }

  const redisUrl = (process.env.REDIS_URL || "").trim();
  if (redisUrl) {
    const tR = Date.now();
    const c = createClient({ url: redisUrl }) as unknown as RedisClientType;
    try {
      await c.connect();
      await c.ping();
      redis.ok = true;
      redis.latency_ms = Date.now() - tR;
      try {
        const last = await c.xRevRange(STREAM, "+", "-", { COUNT: 1 });
        const id = last?.[0]?.id;
        stream_lag_ms = streamEntryLagMs(id);
      } catch {
        stream_lag_ms = null;
      }
      try {
        const gi = await c.xInfoGroups(STREAM);
        redis.groups = gi;
        const row = Array.isArray(gi)
          ? (gi as { name?: string; pending?: number }[]).find((g) => g.name === GROUP)
          : null;
        if (row && typeof row.pending === "number") pending_count = row.pending;
      } catch {
        pending_count = null;
      }
    } catch (e) {
      redis.error = e instanceof Error ? e.message : String(e);
    } finally {
      try {
        await c.quit();
      } catch {
        /* ignore */
      }
    }
  } else {
    redis.error = "REDIS_URL not set";
  }

  const base = (process.env.BRIDGE_INTERNAL_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
  const fallbackRaw = (process.env.BRIDGE_INTERNAL_FALLBACK_URL || "").replace(/\/$/, "").trim();
  /** Docker → host can be slow; optional second URL (e.g. http://172.17.0.1:3100) if host.docker.internal fails. */
  const candidates = [...new Set([base, fallbackRaw].filter((x) => x.length > 0))];
  /** Docker → host (host.docker.internal) can exceed 2.5s on cold DNS/TCP; UI showed "This operation was aborted" at exactly 2500ms. */
  const bridgeProbeMs = Math.min(60_000, Math.max(3_000, Number(process.env.BRIDGE_HEALTH_TIMEOUT_MS || 12_000)));

  let reachedBridge = false;
  for (const root of candidates) {
    const tB = Date.now();
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), bridgeProbeMs);
      const res = await fetch(`${root}/ready`, { method: "GET", signal: ac.signal });
      clearTimeout(timer);
      bridge.status = res.status;
      bridge.ok = res.ok;
      bridge.latency_ms = Date.now() - tB;
      bridge.error = res.ok ? undefined : (await res.text()).slice(0, 500);
      reachedBridge = true;
      break;
    } catch (e) {
      bridge.latency_ms = Date.now() - tB;
      const detail = formatFetchError(e);
      const isLast = candidates.indexOf(root) === candidates.length - 1;
      if (isLast) {
        bridge.ok = false;
        bridge.status = undefined;
        bridge.error =
          candidates.length > 1
            ? `${detail} (tried: ${candidates.join(" | ")})`
            : `${detail} — set BRIDGE_INTERNAL_URL to the Docker host gateway (often http://172.17.0.1:3100; run: docker network inspect bridge | grep Gateway) or add BRIDGE_INTERNAL_FALLBACK_URL`;
      }
    }
  }
  if (!reachedBridge && !bridge.error) {
    bridge.ok = false;
    bridge.error = "no_bridge_url_configured";
  }

  let status: DeepHealthStatus = "ok";
  if (!db.ok) status = "down";
  else if (!redis.ok || !bridge.ok) status = "degraded";
  if (redis.ok && pending_count != null && pending_count > 500) status = status === "down" ? "down" : "degraded";
  if (redis.ok && stream_lag_ms != null && stream_lag_ms > 120_000) status = status === "down" ? "down" : "degraded";

  const dead_letter_spike =
    dead_letter_events_5m != null && dead_letter_events_5m >= DEAD_LETTER_ALERT_THRESHOLD;
  if (dead_letter_spike) status = status === "down" ? "down" : "degraded";

  const report: DeepHealthReport = {
    status,
    checked_at,
    db,
    redis,
    bridge,
    lag_ms: stream_lag_ms,
    stream_lag_ms,
    pending_count,
    dead_letter_events_5m,
    dead_letter_spike,
  };

  const webhook = (process.env.ALERT_WEBHOOK_URL || "").trim();
  if (webhook && dead_letter_spike) {
    const body = JSON.stringify({
      source: "ops_deep_health",
      checked_at,
      dead_letter_events_5m,
      threshold: DEAD_LETTER_ALERT_THRESHOLD,
      status: report.status,
    });
    void fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(4000),
    }).catch(() => undefined);
  }

  return report;
}
