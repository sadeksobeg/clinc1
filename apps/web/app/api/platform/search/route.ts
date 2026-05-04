import { NextResponse } from "next/server";
import { callOpsApi } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";
import { z } from "zod";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

const querySchema = z.object({
  q: z.string().max(200).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function GET(req: Request) {
  const allowed = await requirePlatformPerm(req, "search.read");
  if (allowed instanceof NextResponse) return allowed;
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? "", limit: url.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return NextResponse.json(fail("invalid_query", "Invalid query", parsed.error.flatten()), { status: 400 });

  const upstream = await callOpsApi(
    req,
    `/api/internal/platform/search?q=${encodeURIComponent(parsed.data.q)}&limit=${encodeURIComponent(String(parsed.data.limit))}`,
    {
      method: "GET",
    },
  );
  const upstreamJson = (await upstream.json().catch(() => null)) as any;
  if (!upstream.ok || !upstreamJson || upstreamJson.ok !== true) {
    return NextResponse.json(
      fail(String(upstreamJson?.error || "upstream_error"), "Upstream search failed", { status: upstream.status }),
      { status: upstream.ok ? 400 : upstream.status },
    );
  }
  return NextResponse.json(ok(upstreamJson), { status: 200 });
}

