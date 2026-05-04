import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export type OpsJwtPayload = JWTPayload & {
  sub: string;
  email?: string;
  role?: string;
  scope?: "clinic" | "platform";
  clinicId?: number;
  billingStatus?: "trial" | "trial_expiring" | "trial_expired" | "active" | "past_due" | "grace" | "suspended" | "cancelled";
  billingLocked?: boolean;
  trialEndsAt?: string | null;
  tokenVersion?: number;
};

function readSecretKey(): Uint8Array | null {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

export async function signOpsToken(payload: {
  sub: string;
  email: string;
  role: string;
  scope?: "clinic" | "platform";
  clinicId?: number;
  billingStatus?: "trial" | "trial_expiring" | "trial_expired" | "active" | "past_due" | "grace" | "suspended" | "cancelled";
  billingLocked?: boolean;
  trialEndsAt?: string | null;
  tokenVersion?: number;
}) {
  const key = readSecretKey();
  if (!key) {
    throw new Error("JWT_SECRET must be set to a random string of at least 16 characters.");
  }
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    scope: payload.scope || "clinic",
    clinicId: payload.clinicId ?? null,
    billingStatus: payload.billingStatus,
    billingLocked: payload.billingLocked,
    trialEndsAt: payload.trialEndsAt ?? null,
    tokenVersion: payload.tokenVersion ?? 1,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key);
}

export async function verifyOpsToken(token: string): Promise<OpsJwtPayload | null> {
  const key = readSecretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload as OpsJwtPayload;
  } catch {
    return null;
  }
}
