import { cookies } from "next/headers";
import { getPool } from "@/lib/db";
import { assertTokenVersion } from "@/lib/sessionRevocation";
import { verifyOpsToken, type OpsJwtPayload } from "./jwt";

const COOKIE = "ops_session";

export function sessionCookieName() {
  return COOKIE;
}

export async function getSession(): Promise<OpsJwtPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const payload = await verifyOpsToken(raw);
  if (!payload?.sub) return null;
  try {
    const ok = await assertTokenVersion(getPool(), payload.sub, payload.tokenVersion);
    if (!ok) return null;
  } catch {
    return null;
  }
  return payload;
}
