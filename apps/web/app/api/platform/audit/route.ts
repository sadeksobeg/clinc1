import { NextResponse } from "next/server";
import { callOpsApi, requireUserSession } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { z } from "zod";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

const querySchema = z.object({
  clinic_id: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  limit: z.coerce.number().int().min(10).max(200).optional().default(80),
});

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "audit.read");
  if (allowed instanceof NextResponse) return allowed;
  const u = new URL(req.url);
  const parsed = querySchema.safeParse({
    clinic_id: u.searchParams.get("clinic_id") ?? undefined,
    limit: u.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json(fail("invalid_query", "Invalid query", parsed.error.flatten()), { status: 400 });

  const upstream = await callOpsApi(
    req,
    `/api/internal/audit/actions?clinic_id=${encodeURIComponent(String(parsed.data.clinic_id))}&limit=${encodeURIComponent(String(parsed.data.limit))}`,
    {
      method: "GET",
    },
  );
  const upstreamJson = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !upstreamJson || upstreamJson.ok !== true) {
    const upstreamCode = String(upstreamJson?.error?.code || upstreamJson?.error || upstreamJson?.message || "upstream_error");
    const upstreamMessage = String(upstreamJson?.error?.message || upstreamJson?.message || "Upstream audit failed");
    return NextResponse.json(
      fail(upstreamCode, upstreamMessage, { status: upstream.status, upstream: upstreamJson }),
      { status: upstream.ok ? 400 : upstream.status },
    );
  }
  return NextResponse.json(ok(upstreamJson), { status: 200 });
}

