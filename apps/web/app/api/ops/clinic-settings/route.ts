import { NextResponse } from "next/server";
import { fetchClinicSettings, patchClinicSettings } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const out = await fetchClinicSettings(user.clinic_id);
  if (!out.ok) return NextResponse.json(out, { status: 500 });
  return NextResponse.json(out);
}

export async function PATCH(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const out = await patchClinicSettings(user.clinic_id, {
    name: typeof (body as { name?: unknown }).name === "string" ? (body as { name: string }).name : undefined,
    timezone: typeof (body as { timezone?: unknown }).timezone === "string" ? (body as { timezone: string }).timezone : undefined,
    holidays:
      Array.isArray((body as { holidays?: unknown[] }).holidays)
        ? (body as { holidays: unknown[] }).holidays.filter((x): x is string => typeof x === "string")
        : undefined,
    working_hours:
      Array.isArray((body as { working_hours?: unknown[] }).working_hours)
        ? (body as { working_hours: unknown[] }).working_hours
        : undefined,
    metadata:
      body && typeof body === "object" && (body as { metadata?: unknown }).metadata && typeof (body as { metadata: unknown }).metadata === "object"
        ? ((body as { metadata: Record<string, unknown> }).metadata ?? {})
        : undefined,
  });
  if (!out.ok) return NextResponse.json(out, { status: 500 });
  return NextResponse.json(out);
}
