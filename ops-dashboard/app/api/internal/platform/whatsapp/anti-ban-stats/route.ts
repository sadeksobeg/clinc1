/** Anti-ban health snapshot — daily caps, warm-up, broadcast circuit, recent audit. */
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { platformGuard } from "@/lib/platform/platformAuth";

async function fetchBridgeStatus(): Promise<unknown | null> {
  const base = (process.env.BRIDGE_INTERNAL_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
  const fallback = (process.env.BRIDGE_INTERNAL_FALLBACK_URL || "").replace(/\/$/, "").trim();
  const candidates = [...new Set([base, fallback].filter((x) => x.length > 0))];
  const token = (process.env.BRIDGE_SEND_API_TOKEN || "").trim();
  for (const url of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${url}/anti-ban/status`, {
        signal: ctrl.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      clearTimeout(t);
      if (res.ok) return await res.json();
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET(req: Request) {
  const g = await platformGuard(req, "whatsapp.health.read");
  if (!g.ok) return g.res;

  const pool = getPool();
  const url = new URL(req.url);
  const sinceHours = Math.max(1, Math.min(168, Number(url.searchParams.get("since_hours")) || 24));

  const [bridge, status24, top, recent, numbers] = await Promise.all([
    fetchBridgeStatus(),
    pool
      .query(
        `SELECT status, COUNT(*)::int AS n
           FROM wa_send_audit
          WHERE created_at >= NOW() - ($1 || ' hours')::interval
          GROUP BY status`,
        [String(sinceHours)],
      )
      .catch(() => ({ rows: [] as { status: string; n: number }[] })),
    pool
      .query(
        `SELECT blocked_reason, COUNT(*)::int AS n
           FROM wa_send_audit
          WHERE status = 'blocked'
            AND created_at >= NOW() - ($1 || ' hours')::interval
          GROUP BY blocked_reason
          ORDER BY n DESC
          LIMIT 10`,
        [String(sinceHours)],
      )
      .catch(() => ({ rows: [] as { blocked_reason: string; n: number }[] })),
    pool
      .query(
        `SELECT id, chat_id, clinic_id, status, blocked_reason, send_kind,
                latency_ms, created_at
           FROM wa_send_audit
          ORDER BY id DESC
          LIMIT 50`,
      )
      .catch(() => ({ rows: [] })),
    pool
      .query(
        `SELECT to_number, paired_at, last_connected_at, last_disconnected_at, is_paused, paused_reason
           FROM wa_number_state
          ORDER BY id ASC`,
      )
      .catch(() => ({ rows: [] })),
  ]);

  return NextResponse.json({
    ok: true,
    bridge_status: bridge,
    audit_summary: status24.rows,
    top_blocked_reasons: top.rows,
    recent: recent.rows,
    numbers: numbers.rows,
    since_hours: sinceHours,
  });
}
