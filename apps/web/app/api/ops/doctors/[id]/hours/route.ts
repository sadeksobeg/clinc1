import { NextResponse } from "next/server";
import { requireUserWithClinic } from "@/lib/secure-api";

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const doctorId = Number(ctx.params.id);
  if (!Number.isFinite(doctorId) || doctorId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const opsBase = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!opsBase || !token) return NextResponse.json({ ok: false, error: "ops_unconfigured" }, { status: 500 });

  const upstream = await fetch(`${opsBase}/api/internal/doctors/${doctorId}/hours`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ ok: false, error: "upstream_unavailable" }, { status: 502 });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const doctorId = Number(ctx.params.id);
  if (!Number.isFinite(doctorId) || doctorId <= 0) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const opsBase = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!opsBase || !token) return NextResponse.json({ ok: false, error: "ops_unconfigured" }, { status: 500 });

  const bodyText = await req.text();
  const upstream = await fetch(`${opsBase}/api/internal/doctors/${doctorId}/hours`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: bodyText,
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ ok: false, error: "upstream_unavailable" }, { status: 502 });
  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}

