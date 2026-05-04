import { NextResponse } from "next/server";
import { fetchSystemDeepHealth } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const out = await fetchSystemDeepHealth();
  return NextResponse.json(out.ok ? out.data : out, { status: out.ok ? 200 : 500 });
}
