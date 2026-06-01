import { NextResponse } from "next/server";
import { requireUserWithClinic } from "@/lib/secure-api";

function opsBaseUrl(): string {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  if (!u) throw new Error("OPS_DASHBOARD_URL is not set");
  return u;
}

function serviceHeaders(): HeadersInit {
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!token) throw new Error("SCHEDULING_SERVICE_TOKEN is not set");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  try {
    const res = await fetch(
      `${opsBaseUrl()}/api/internal/clinic-specialties?clinic_id=${user.clinic_id}`,
      { headers: serviceHeaders(), cache: "no-store" },
    );
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: unknown[]; error?: string };
    return NextResponse.json(json, { status: res.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
