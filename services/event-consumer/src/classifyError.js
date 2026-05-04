/**
 * PostgreSQL / network codes: fatal → DLQ immediately (no retries).
 * Mirrors semantics documented in ops-dashboard/lib/errors/eventErrors.ts.
 */

const PG_FATAL_IMMEDIATE = new Set([
  "23503", // foreign_key_violation — bad event payload vs CRM
  "23514", // check_violation
  "42703", // undefined_column — schema drift
  "42P01", // undefined_table
]);

const PG_TRANSIENT = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
  "53300", // too_many_connections
  "57P01", // admin_shutdown
  "08006", // connection_failure
  "08003", // connection_does_not_exist
]);

export function isFatalPgOrPayloadError(err) {
  if (err && typeof err === "object" && err.name === "FatalServiceError") return true;
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  if (PG_FATAL_IMMEDIATE.has(code)) return true;
  return false;
}

export function isTransientPgError(err) {
  if (err && typeof err === "object" && err.name === "TransientError") return true;
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  if (PG_TRANSIENT.has(code)) return true;
  const net = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"];
  if (net.includes(code)) return true;
  return false;
}
