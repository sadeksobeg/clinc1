import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/secure-api";
import { ok, fail } from "@/lib/api-response";

function isPlatformSuperAdmin(role?: string, scope?: string): boolean {
  return String(role || "").toLowerCase() === "super_admin" && scope === "platform";
}

function internalOrigin(req: Request): string {
  const internal = process.env.INTERNAL_WEB_ORIGIN?.replace(/\/$/, "").trim();
  if (internal) return internal;
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://127.0.0.1:3000";
  }
}

export async function GET(req: Request) {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  if (!isPlatformSuperAdmin(session.role, session.scope)) {
    return NextResponse.json(fail("forbidden", "Forbidden"), { status: 403 });
  }

  const base = internalOrigin(req);
  const [clinicsRes, revenueRes, presenceRes] = await Promise.all([
    fetch(new URL("/api/platform/clinics", base), {
      headers: { cookie: req.headers.get("cookie") || "" },
      cache: "no-store",
    }),
    fetch(new URL("/api/ops/billing/admin/revenue", base), {
      headers: { cookie: req.headers.get("cookie") || "" },
      cache: "no-store",
    }),
    fetch(new URL("/api/platform/clinics/presence?window_minutes=5", base), {
      headers: { cookie: req.headers.get("cookie") || "" },
      cache: "no-store",
    }),
  ]).catch(() => [null, null, null] as const);
  if (!clinicsRes || !revenueRes || !presenceRes) {
    return NextResponse.json(fail("internal_fetch_failed", "Failed to query platform aggregates"), { status: 502 });
  }
  const clinicsJson = (await clinicsRes.json().catch(() => null)) as any;
  const revenueJson = (await revenueRes.json().catch(() => null)) as any;
  const presenceJson = (await presenceRes.json().catch(() => null)) as any;
  if (!clinicsRes.ok || !revenueRes.ok || !clinicsJson || !revenueJson) {
    return NextResponse.json(
      fail("upstream_error", "Upstream request failed", { clinics_status: clinicsRes.status, revenue_status: revenueRes.status }),
      { status: clinicsRes.ok && revenueRes.ok ? 400 : 502 },
    );
  }
  if (clinicsJson.ok !== true || !Array.isArray(clinicsJson.clinics) || revenueJson.ok !== true || !Array.isArray(revenueJson.clinics)) {
    return NextResponse.json(fail("invalid_upstream_shape", "Invalid upstream response shape"), { status: 502 });
  }

  type RevenueClinic = NonNullable<(typeof revenueJson)["clinics"]>[number];
  const revenueByClinic = new Map<number, RevenueClinic>();
  for (const row of revenueJson.clinics ?? []) revenueByClinic.set(Number(row.clinic_id), row);

  const presenceByClinic = new Map<number, { online: boolean; last_seen_at: string | null }>();
  if (presenceRes.ok && presenceJson && presenceJson.ok === true && Array.isArray(presenceJson.clinics)) {
    for (const row of presenceJson.clinics ?? []) {
      const id = Number(row?.clinic_id || 0);
      if (!Number.isFinite(id) || id <= 0) continue;
      presenceByClinic.set(id, { online: Boolean(row?.online), last_seen_at: row?.last_seen_at ? String(row.last_seen_at) : null });
    }
  }

  // Build a stable, unique clinic list (avoid duplicate/invalid ids like 0).
  // Upstream clinics shape can be either:
  // - { clinic_id, clinic_name?, name?, slug? } (platform-safe)
  // - { id, name, slug } (scheduling/clinics)
  const unique = new Map<number, any>();
  for (const c of clinicsJson.clinics ?? []) {
    const id = Number((c as any)?.clinic_id || (c as any)?.id || 0);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (unique.has(id)) continue;
    const name = String((c as any)?.clinic_name || (c as any)?.name || `Clinic #${id}`);
    const rev = revenueByClinic.get(id);
    const p = presenceByClinic.get(id);
    unique.set(id, {
      clinic_id: id,
      clinic_name: name,
      status: rev?.status ?? "unknown",
      next_renewal_at: rev?.next_renewal_at ?? null,
      doctor_count: Number(rev?.doctor_count || 0),
      estimated_monthly_total_usd: Number(rev?.estimated_monthly_total_usd || 0),
      online: p?.online ?? false,
      last_seen_at: p?.last_seen_at ?? null,
    });
  }

  const clinics = Array.from(unique.values());

  return NextResponse.json(
    ok({
      clinics,
      summary: (revenueJson.summary ?? {}) as Record<string, unknown>,
    }),
    { status: 200 },
  );
}

