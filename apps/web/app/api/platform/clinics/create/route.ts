import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    clinic_name: z.string().min(2).max(200),
    owner_name: z.string().min(2).max(200),
    owner_email: z.string().email().max(254),
    owner_password: z.string().min(8).max(200),
    doctors_count: z.number().int().min(1).max(50).optional(),
    trial_days: z.number().int().min(1).max(30).optional(),
    specialty_ids: z.array(z.number().int().positive()).min(1).max(12),
    doctor_names: z.array(z.string().min(2).max(120)).max(50).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const allowed = await requirePlatformPerm(req, "clinic.create");
  if (allowed instanceof NextResponse) return allowed;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(fail("invalid_body", "Invalid body", parsed.error.flatten()), { status: 400 });

  const upstream = await callOpsApi(req, "/api/internal/platform/clinics/create", { method: "POST", bodyObject: parsed.data });
  const json = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !json || json.ok !== true) {
    return NextResponse.json(fail(String(json?.error || "upstream_error"), "Upstream create clinic failed", { status: upstream.status, upstream: json }), {
      status: upstream.ok ? 400 : upstream.status,
    });
  }
  return NextResponse.json(ok(json), { status: 201 });
}

