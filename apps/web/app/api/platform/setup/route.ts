import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { callOpsApi, requireUserSession } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

type SetupCheck = {
  ok: boolean;
  status?: number;
  error?: string;
  details?: unknown;
};

async function safeOpsCheck(req: Request, path: string): Promise<SetupCheck> {
  try {
    const r = await callOpsApi(req, path, { method: "GET" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      return { ok: false, status: r.status, error: String((j as any)?.error || "upstream_error"), details: j };
    }
    if (j && typeof j === "object" && "ok" in (j as any) && (j as any).ok === false) {
      return { ok: false, status: r.status, error: String((j as any).error || "upstream_error"), details: j };
    }
    return { ok: true, status: r.status, details: j };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "unknown_error" };
  }
}

export async function GET(req: Request) {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  if (session.scope !== "platform") return NextResponse.json(fail("forbidden", "Forbidden"), { status: 403 });

  const env = {
    ops_dashboard_url_set: Boolean(process.env.OPS_DASHBOARD_URL?.trim()),
    scheduling_service_token_set: Boolean(process.env.SCHEDULING_SERVICE_TOKEN?.trim()),
  };

  const [health, deepHealth, perms] = await Promise.all([
    safeOpsCheck(req, "/api/internal/system/health"),
    safeOpsCheck(req, "/api/system/health/deep"),
    safeOpsCheck(req, "/api/internal/platform/me/permissions"),
  ]);

  return NextResponse.json(
    ok({
      env,
      checks: {
        ops_health: health,
        ops_deep_health: deepHealth,
        platform_permissions: perms,
      },
    }),
    { status: 200 },
  );
}

