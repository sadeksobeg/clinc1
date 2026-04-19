import { NextResponse } from "next/server";
import { getSession } from "./session";
import type { OpsJwtPayload } from "./jwt";
import { isDoctor, isSecretary } from "./roleAuth";

export async function requireSecretarySession(): Promise<
  { ok: true; session: OpsJwtPayload } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session?.sub) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isSecretary(session)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}

export async function requireDoctorSession(): Promise<
  { ok: true; session: OpsJwtPayload } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session?.sub) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isDoctor(session)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}
