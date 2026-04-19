import { cookies } from "next/headers";
import { verifyOpsToken, type OpsJwtPayload } from "./jwt";

const COOKIE = "ops_session";

export function sessionCookieName() {
  return COOKIE;
}

export async function getSession(): Promise<OpsJwtPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  return verifyOpsToken(raw);
}
