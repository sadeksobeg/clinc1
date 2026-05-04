/**
 * Next.js instrumentation — runs once on server startup.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const mode = (process.env.SYSTEM_MODE || "").trim() || "unset";
    console.log(`[ops-dashboard] boot SYSTEM_MODE=${mode} NODE_ENV=${process.env.NODE_ENV || "unset"}`);
  }
}
