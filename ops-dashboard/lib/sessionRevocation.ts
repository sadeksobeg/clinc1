import type { Pool, PoolClient } from "pg";

type DbLike = Pool | PoolClient;

async function queryTokenVersion(db: DbLike, userId: string): Promise<number> {
  const r = await db.query(`SELECT token_version FROM staff_users WHERE id = $1 LIMIT 1`, [userId]);
  if (!r.rowCount) return 0;
  return Number(r.rows[0]?.token_version || 0);
}

export async function readTokenVersion(db: DbLike, userId: string): Promise<number> {
  return queryTokenVersion(db, userId);
}

export async function assertTokenVersion(db: DbLike, userId: string, tokenVersion?: number | null): Promise<boolean> {
  const current = await queryTokenVersion(db, userId);
  if (current <= 0) return false;
  return Number(tokenVersion || 0) === current;
}

export async function bumpTokenVersion(db: DbLike, userId: string): Promise<number> {
  const r = await db.query(
    `UPDATE staff_users
     SET token_version = COALESCE(token_version, 1) + 1
     WHERE id = $1
     RETURNING token_version`,
    [userId],
  );
  if (!r.rowCount) return 0;
  return Number(r.rows[0]?.token_version || 0);
}

export async function registerSession(db: DbLike, userId: string, tokenVersion: number): Promise<void> {
  await db.query(
    `INSERT INTO user_sessions (user_id, token_version)
     VALUES ($1, $2)`,
    [userId, tokenVersion],
  );
}

export async function revokeSessionsBeforeVersion(db: DbLike, userId: string, minVersion: number): Promise<void> {
  await db.query(
    `UPDATE user_sessions
     SET revoked_at = NOW()
     WHERE user_id = $1
       AND token_version < $2
       AND revoked_at IS NULL`,
    [userId, minVersion],
  );
}
