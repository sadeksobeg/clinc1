import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { z } from "zod";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

type Ctx = { params: { id: string } };

const bodySchema = z
  .object({
    action: z.enum(["suspend", "activate", "set_trial_days", "set_plan", "set_owner"]),
    reason: z.string().min(3).max(500).optional(),
    trial_days: z.coerce.number().int().min(1).max(60).optional(),
    plan: z.enum(["starter_120", "custom"]).optional(),
    plan_base_price_usd: z.coerce.number().min(0).max(100000).optional(),
    plan_included_doctors: z.coerce.number().int().min(0).max(1000).optional(),
    plan_extra_doctor_price_usd: z.coerce.number().min(0).max(100000).optional(),
    owner_name: z.string().min(2).max(120).optional(),
    owner_whatsapp: z.string().min(6).max(64).optional(),
  })
  .strict();

export async function POST(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "clinic.lifecycle.write");
  if (allowed instanceof NextResponse) return allowed;
  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json(fail("bad_id", "Bad clinic id"), { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json(fail("invalid_body", "Invalid body", parsed.error.flatten()), { status: 400 });

  if (parsed.data.action === "suspend" && !parsed.data.reason) {
    return NextResponse.json(fail("reason_required", "Suspend requires reason"), { status: 400 });
  }

  const upstream = await callOpsApi(req, `/api/internal/platform/clinics/${clinicId}/lifecycle`, {
    method: "POST",
    bodyObject: parsed.data,
  });
  const upstreamJson = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !upstreamJson || upstreamJson.ok !== true) {
    return NextResponse.json(
      fail(String(upstreamJson?.error || "upstream_error"), "Upstream lifecycle action failed", { status: upstream.status }),
      { status: upstream.ok ? 400 : upstream.status },
    );
  }
  return NextResponse.json(ok(upstreamJson), { status: 200 });
}

