import { NextResponse } from "next/server";
import { fetchPatientDetail } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const patientId = Number(ctx.params.id);
  if (!Number.isFinite(patientId) || patientId < 1) {
    return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });
  }
  const out = await fetchPatientDetail(patientId, user.clinic_id);
  return NextResponse.json(out, { status: out.ok ? 200 : out.error === "not_found" ? 404 : 400 });
}
