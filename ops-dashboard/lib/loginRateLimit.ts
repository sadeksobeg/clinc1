const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= maxPerWindow) return false;
  b.count += 1;
  return true;
}
