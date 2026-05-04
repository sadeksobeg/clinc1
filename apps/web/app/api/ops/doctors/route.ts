import { NextResponse } from "next/server";
import { fetchDoctorsRows } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const out = await fetchDoctorsRows(user.clinic_id);
  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
