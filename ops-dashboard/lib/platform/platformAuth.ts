/**
 * Shared 3-layer auth helper for /api/internal/platform/* endpoints.
 *
 *   1. SCHEDULING_SERVICE_TOKEN — Bearer auth between apps/web and ops-dashboard.
 *   2. `x-platform-scope: true` — explicit opt-in header from the proxy.
 *   3. `requirePlatformPerm(perm)` — fine-grained platform-permission check.
 */
import { NextResponse } from "next/server";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { requirePlatformPerm } from "@/lib/platform/platformPerms";

export type AuthOk = { ok: true; actor: number };
export type AuthErr = { ok: false; res: NextResponse };

export async function platformGuard(req: Request, perm: string): Promise<AuthOk | AuthErr> {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return { ok: false, res: denied };
  if (req.headers.get("x-platform-scope") !== "true") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 }),
    };
  }
  const guard = await requirePlatformPerm(req, perm);
  if (!guard.ok) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }),
    };
  }
  return { ok: true, actor: guard.actor };
}
