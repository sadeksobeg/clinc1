/**
 * Structured stderr logging for API routes (grep-friendly in Docker / PM2).
 */
export type OpsLogLevel = "error" | "warn" | "info";

export function opsLog(level: OpsLogLevel, component: string, message: string, context?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...context,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function opsLogError(component: string, err: unknown, context?: Record<string, unknown>) {
  const e = err instanceof Error ? err : new Error(String(err));
  opsLog("error", component, e.message, {
    ...context,
    name: e.name,
    stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
  });
}
