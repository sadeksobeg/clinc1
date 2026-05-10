import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

function normalizeIp(raw: string): string {
  if (!raw) return "unknown";
  const first = raw.includes(",") ? raw.split(",")[0]!.trim() : raw.trim();
  if (!first) return "unknown";
  let ip = first;
  // Remove IPv6 brackets.
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  // Handle IPv4:port
  if (ip.includes(".") && ip.includes(":") && !ip.includes("::")) {
    const maybe = ip.split(":")[0]!.trim();
    if (maybe) ip = maybe;
  }
  // Normalize IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  if (ip.toLowerCase().startsWith("::ffff:")) {
    ip = ip.slice(7);
  }
  // Normalize localhost aliases.
  if (ip === "localhost") return "127.0.0.1";
  return ip;
}

export function requestIp(req: Request): string {
  const hostRaw = String(req.headers.get("host") || "").trim();
  const host = hostRaw.toLowerCase();
  // وصول مباشر إلى localhost: Host أوثق من X-Forwarded-For (قد يضيف بروكسي/دوكر عنوانًا داخليًا غير مدرج في القائمة).
  if (host.includes("localhost") || host.includes("127.0.0.1") || host.includes("[::1]")) {
    return host.includes("[::1]") ? "::1" : "127.0.0.1";
  }
  // Host يحوي عنوان IPv4 علنيًا (مثلاً curl إلى http://SERVER_IP:3001)
  const v4Host = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/i.exec(hostRaw);
  if (v4Host) return normalizeIp(v4Host[1]!);
  const v6Host = /^\[([^\]]+)\](?::\d+)?$/i.exec(hostRaw);
  if (v6Host) return normalizeIp(v6Host[1]!);

  const forwarded = normalizeIp(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "");
  if (forwarded && forwarded !== "unknown") return forwarded;
  return forwarded || "unknown";
}

function ipToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  const nums = p.map((x) => Number(x));
  if (nums.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((nums[0]! << 24) >>> 0) + (nums[1]! << 16) + (nums[2]! << 8) + nums[3]!;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, prefixRaw] = cidr.split("/");
  const ipN = ipToInt(ip);
  const baseN = ipToInt(base || "");
  const prefix = Number(prefixRaw || "32");
  if (ipN == null || baseN == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

export function ipMatchesAllowlist(ip: string, allow: string[]): boolean {
  const source = normalizeIp(ip);
  if (!source || source === "unknown") return false;
  for (const item of allow) {
    const v = item.trim();
    if (!v) continue;
    if (v.includes("/")) {
      const [base, prefixRaw] = v.split("/");
      // Minimal IPv6 CIDR support for localhost /128.
      if (source.includes(":") && String(base || "").includes(":")) {
        const prefix = Number(prefixRaw || "");
        if (prefix === 128 && normalizeIp(base || "") === source) return true;
      }
      if (ipv4InCidr(source, v)) return true;
      continue;
    }
    if (normalizeIp(v) === source) return true;
  }
  return false;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const c = Buffer.alloc(8);
  c.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  c.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", secret).update(c).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secretBase32: string, otpCode: string, nowMs = Date.now()): boolean {
  const secret = base32Decode(secretBase32);
  if (!secret.length) return false;
  const provided = otpCode.trim();
  if (!/^\d{6}$/.test(provided)) return false;
  const step = 30;
  const t = Math.floor(nowMs / 1000 / step);
  for (const drift of [-1, 0, 1]) {
    const expected = hotp(secret, t + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export async function readSuperAdminSecurity(pool: Pool, userId: string) {
  const [mfa, ips] = await Promise.all([
    pool.query<{ secret_key: string; last_verified_at: string | null }>(
      `SELECT secret_key, last_verified_at
       FROM user_mfa_secrets
       WHERE user_id = $1
       LIMIT 1`,
      [userId],
    ),
    pool.query<{ ip_cidr: string }>(
      `SELECT ip_cidr
       FROM user_ip_allowlist
       WHERE user_id = $1
         AND is_active = TRUE`,
      [userId],
    ),
  ]);
  return {
    mfaSecret: mfa.rows[0]?.secret_key || "",
    allowlist: ips.rows.map((x) => x.ip_cidr),
  };
}
