import { jwtVerify, type JWTPayload } from "jose";

export type WebUserSession = {
  user_id: string;
  email?: string;
  role?: string;
  scope?: "clinic" | "platform";
  clinic_id: number;
  acting_clinic_id?: number | null;
  billing_status?: string;
  billing_locked?: boolean;
  trial_ends_at?: string | null;
  token_version?: number;
  raw_token: string;
};

function secretKey(): Uint8Array | null {
  const v = process.env.JWT_SECRET?.trim();
  if (!v || v.length < 16) return null;
  return new TextEncoder().encode(v);
}

function cookieValue(cookieHeader: string, key: string): string | null {
  const items = cookieHeader.split(";").map((x) => x.trim());
  for (const item of items) {
    if (!item.startsWith(`${key}=`)) continue;
    const value = item.slice(key.length + 1);
    if (!value) return null;
    return decodeURIComponent(value);
  }
  return null;
}

export function readOpsSessionTokenFromHeaders(headers: Headers): string | null {
  return cookieValue(headers.get("cookie") || "", "ops_session");
}

/** Decode JWT payload without verification (for Edge middleware / fallback when ops already verified upstream). */
export function decodeJwtPayloadUnverified(token: string): (JWTPayload & Record<string, unknown>) | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const raw = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(raw) as JWTPayload & Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Ops may issue clinic-scoped JWT for super_admin with clinic_id 0; treat as platform so middleware accepts the session. */
function normalizeSuperAdminScope(
  role: string | undefined,
  scope: "platform" | "clinic",
  clinicId: number,
): { scope: "platform" | "clinic"; clinicId: number } {
  const roleLower = String(role || "").toLowerCase();
  if (roleLower === "super_admin" && scope === "clinic" && !clinicId) {
    return { scope: "platform", clinicId: 0 };
  }
  return { scope, clinicId };
}

export async function parseSessionFromToken(token: string): Promise<WebUserSession | null> {
  const key = secretKey();
  const payloadFromDecode = decodeJwtPayloadUnverified(token);
  if (!key && payloadFromDecode) {
    const rawScope =
      payloadFromDecode.scope === "platform" || payloadFromDecode.scope === "clinic" ? payloadFromDecode.scope : "clinic";
    const role = typeof payloadFromDecode.role === "string" ? payloadFromDecode.role : "";
    let clinicId = Number(payloadFromDecode.clinicId || 0);
    let scope = rawScope;
    ({ scope, clinicId } = normalizeSuperAdminScope(role, scope, clinicId));
    if (!payloadFromDecode.sub) return null;
    if (!(scope === "platform") && !clinicId) return null;
    return {
      user_id: String(payloadFromDecode.sub),
      email: typeof payloadFromDecode.email === "string" ? payloadFromDecode.email : undefined,
      role: role || undefined,
      scope,
      clinic_id:
        scope === "platform"
          ? 0
          : clinicId || 0,
      acting_clinic_id: null,
      billing_status: typeof payloadFromDecode.billingStatus === "string" ? payloadFromDecode.billingStatus : undefined,
      billing_locked: payloadFromDecode.billingLocked === true,
      trial_ends_at: (payloadFromDecode.trialEndsAt as string | null | undefined) ?? null,
      token_version: Number.isFinite(Number(payloadFromDecode.tokenVersion)) ? Number(payloadFromDecode.tokenVersion) : undefined,
      raw_token: token,
    };
  }
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const p = payload as JWTPayload & {
      email?: string;
      role?: string;
      scope?: "clinic" | "platform";
      clinicId?: number;
      billingStatus?: string;
      billingLocked?: boolean;
      trialEndsAt?: string | null;
      tokenVersion?: number;
    };
    const role = String(p.role || "");
    const rawScope = p.scope === "platform" || p.scope === "clinic" ? p.scope : "clinic";
    let clinicId = Number(p.clinicId || 0);
    let scope = rawScope;
    ({ scope, clinicId } = normalizeSuperAdminScope(role, scope, clinicId));
    if (!p.sub) return null;
    if (!(scope === "platform") && !clinicId) return null;
    return {
      user_id: String(p.sub),
      email: p.email,
      role: p.role,
      scope,
      clinic_id: scope === "platform" ? 0 : clinicId || 0,
      acting_clinic_id: null,
      billing_status: p.billingStatus,
      billing_locked: p.billingLocked === true,
      trial_ends_at: p.trialEndsAt ?? null,
      token_version: Number.isFinite(Number(p.tokenVersion)) ? Number(p.tokenVersion) : undefined,
      raw_token: token,
    };
  } catch {
    return null;
  }
}

export async function getUserSessionFromHeaders(headers: Headers): Promise<WebUserSession | null> {
  const token = readOpsSessionTokenFromHeaders(headers);
  if (!token) return null;
  return parseSessionFromToken(token);
}
