import { cookies } from "next/headers";
import { parseSessionFromToken, type WebUserSession } from "@/lib/webAuth";

export async function getServerSession(): Promise<WebUserSession | null> {
  const jar = await cookies();
  const token = jar.get("ops_session")?.value;
  if (!token) return null;
  return parseSessionFromToken(token);
}

export async function getServerClinicIdOrThrow(): Promise<number> {
  const [session, jar] = await Promise.all([getServerSession(), cookies()]);
  const isPlatformSuperAdmin = String(session?.role || "").toLowerCase() === "super_admin" && session?.scope === "platform";
  const actingClinicId = Number(jar.get("platform_acting_clinic_id")?.value || 0);
  const clinicId = isPlatformSuperAdmin ? actingClinicId : Number(session?.clinic_id || 0);
  if (!clinicId) throw new Error("clinic_id is required in session");
  return clinicId;
}

export async function getPlatformActingClinicId(): Promise<number> {
  const jar = await cookies();
  const value = Number(jar.get("platform_acting_clinic_id")?.value || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
