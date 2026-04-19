import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

async function fetchBridgeHealth() {
  const base = (process.env.BRIDGE_INTERNAL_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/health`, { cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    return { ok: r.ok, body: j };
  } catch {
    return { ok: false, body: null };
  }
}

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session?.clinicId) redirect("/login");
  const clinicId = Number(session.clinicId);
  const pool = getPool();

  let openConversations = 0;
  let inbound24h = 0;
  const r1 = await pool.query(
    `SELECT COUNT(*)::int AS c FROM conversations WHERE clinic_id = $1 AND status = 'open' AND deleted_at IS NULL`,
    [clinicId],
  );
  openConversations = r1.rows[0]?.c ?? 0;
  const r2 = await pool.query(
    `SELECT COUNT(*)::int AS c FROM messages
     WHERE clinic_id = $1 AND direction = 'inbound' AND created_at > NOW() - INTERVAL '24 hours'`,
    [clinicId],
  );
  inbound24h = r2.rows[0]?.c ?? 0;

  const bridge = await fetchBridgeHealth();

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold text-white">تحليلات سريعة</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">محادثات مفتوحة</p>
          <p className="text-2xl font-semibold text-white">{openConversations}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">رسائل واردة (24 ساعة)</p>
          <p className="text-2xl font-semibold text-white">{inbound24h}</p>
        </div>
      </div>
      <section className="mt-8 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-300">جسر واتساب</h2>
        {!bridge.ok ? (
          <p className="text-sm text-red-400">غير متصل — تحقق من BRIDGE_INTERNAL_URL والجسر.</p>
        ) : (
          <pre className="overflow-auto text-xs text-slate-400">{JSON.stringify(bridge.body, null, 2)}</pre>
        )}
      </section>
    </main>
  );
}
