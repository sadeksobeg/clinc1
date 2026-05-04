/**
 * In-process sliding window limiter for bridge sends (per ops-dashboard process).
 * Tune with WHATSAPP_OPS_SEND_MAX_PER_WINDOW (default 10) and WHATSAPP_OPS_SEND_WINDOW_MS (default 1000).
 */
const windowMs = Math.max(100, Number(process.env.WHATSAPP_OPS_SEND_WINDOW_MS || 1000));
const maxPerWindow = Math.max(1, Number(process.env.WHATSAPP_OPS_SEND_MAX_PER_WINDOW || 10));
const stamps: number[] = [];

function prune(now: number): void {
  const cutoff = now - windowMs;
  while (stamps.length > 0 && stamps[0]! < cutoff) stamps.shift();
}

export async function acquireGlobalBridgeSendSlot(): Promise<void> {
  const now = Date.now();
  prune(now);
  if (stamps.length < maxPerWindow) {
    stamps.push(now);
    return;
  }
  const wait = Math.max(1, stamps[0]! + windowMs - now);
  await new Promise((r) => setTimeout(r, wait));
  return acquireGlobalBridgeSendSlot();
}
