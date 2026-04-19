import type { OpsJwtPayload } from "./jwt";

export function isAdmin(session: OpsJwtPayload | null): boolean {
  return session?.role === "admin";
}

export function isSecretary(session: OpsJwtPayload | null): boolean {
  const r = session?.role;
  return r === "secretary" || r === "admin";
}

export function isDoctor(session: OpsJwtPayload | null): boolean {
  const r = session?.role;
  return r === "doctor" || r === "admin";
}
