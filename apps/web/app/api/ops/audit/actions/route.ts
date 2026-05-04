import { NextResponse } from "next/server";
import { fetchActionAudit } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const u = new URL(req.url);
  const limit = Math.min(200, Math.max(10, Number.parseInt(u.searchParams.get("limit") || "50", 10) || 50));
  const out = await fetchActionAudit({ clinic_id: user.clinic_id, limit });
  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
