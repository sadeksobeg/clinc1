import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

type Ctx = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx) {
  const allowed = await requirePlatformPerm(req, "clinic.read");
  if (allowed instanceof NextResponse) return allowed;

  const clinicId = Number(ctx.params.id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) return NextResponse.json(fail("bad_id", "Bad clinic id"), { status: 400 });

  const headers = { cookie: req.headers.get("cookie") || "" };
  const base = new URL(req.url);
  const urls = {
    clinics: new URL("/api/platform/clinics", base).toString(),
    billing: new URL(`/api/ops/billing/clinics/${clinicId}`, base).toString(),
    invoices: new URL(`/api/ops/billing/clinics/${clinicId}/invoices`, base).toString(),
    tickets: new URL(`/api/ops/support/tickets?limit=50&clinic_id=${clinicId}`, base).toString(),
    audit: new URL(`/api/platform/audit?clinic_id=${clinicId}&limit=30`, base).toString(),
    health: new URL("/api/ops/system/health", base).toString(),
  };

  const [clinicsRes, billingRes, invoicesRes, ticketsRes, auditRes, healthRes] = await Promise.all([
    fetch(urls.clinics, { headers, cache: "no-store" }),
    fetch(urls.billing, { headers, cache: "no-store" }),
    fetch(urls.invoices, { headers, cache: "no-store" }),
    fetch(urls.tickets, { headers, cache: "no-store" }),
    fetch(urls.audit, { headers, cache: "no-store" }),
    fetch(urls.health, { headers, cache: "no-store" }),
  ]);

  const [clinicsJson, billingJson, invoicesJson, ticketsJson, auditJson, healthJson] = await Promise.all([
    clinicsRes.json().catch(() => null),
    billingRes.json().catch(() => null),
    invoicesRes.json().catch(() => null),
    ticketsRes.json().catch(() => null),
    auditRes.json().catch(() => null),
    healthRes.json().catch(() => null),
  ]);

  // Resolve clinic identity from clinics list (platform-safe).
  const clinics = (clinicsJson as any)?.clinics as Array<{ clinic_id: number; clinic_name?: string | null; name?: string | null; slug?: string | null }> | undefined;
  const clinicRow = Array.isArray(clinics) ? clinics.find((c) => Number(c.clinic_id) === clinicId) : null;

  return NextResponse.json(
    ok({
      clinic_id: clinicId,
      clinic: clinicRow
        ? { clinic_id: clinicId, clinic_name: clinicRow.clinic_name ?? clinicRow.name ?? `Clinic #${clinicId}`, slug: clinicRow.slug ?? null }
        : { clinic_id: clinicId, clinic_name: `Clinic #${clinicId}`, slug: null },
      billing: billingJson,
      invoices: invoicesJson,
      tickets: ticketsJson,
      audit: auditJson,
      health: healthJson,
      upstream: {
        clinics: clinicsRes.status,
        billing: billingRes.status,
        invoices: invoicesRes.status,
        tickets: ticketsRes.status,
        audit: auditRes.status,
        health: healthRes.status,
      },
    }),
    { status: 200 },
  );
}

