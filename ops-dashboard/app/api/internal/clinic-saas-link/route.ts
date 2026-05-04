import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { getTenantGuidForClinic } from "@/lib/tenancy/clinicSaaSTenant";
import { opsLogError } from "@/lib/opsLog";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  const url = new URL(req.url);
  const clinicId = Math.max(1, Number.parseInt(url.searchParams.get("clinic_id") || "1", 10) || 1);
  try {
    const pool = getPool();
    const tenant_guid = await getTenantGuidForClinic(pool, clinicId);
    return NextResponse.json({ ok: true, clinic_id: clinicId, tenant_guid });
  } catch (e) {
    opsLogError("internal/clinic-saas-link", e, { clinic_id: clinicId });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
