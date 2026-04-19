import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required for ops dashboard API routes.");
  }
  if (!pool) {
    const max = Math.min(50, Math.max(2, Number(process.env.PG_POOL_MAX || 10) || 10));
    pool = new Pool({
      connectionString: url,
      max,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
    });
    pool.on("error", (err) => {
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", component: "pg_pool", message: err.message }));
    });
  }
  return pool;
}
