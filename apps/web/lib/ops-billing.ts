import "server-only";

function opsBaseUrl(): string {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  if (!u) throw new Error("OPS_DASHBOARD_URL is not set");
  return u;
}

function serviceHeaders(clinicId?: number): HeadersInit {
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!token) throw new Error("SCHEDULING_SERVICE_TOKEN is not set");
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (clinicId && clinicId > 0) h["x-clinic-id"] = String(clinicId);
  return h;
}

export async function fetchOpsPricing(): Promise<{ ok: boolean; pricing?: unknown; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/pricing`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; pricing?: unknown; error?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, pricing: data.pricing };
}

export async function fetchOpsClinicBillingSnapshot(
  clinicId: number,
): Promise<{ ok: boolean; snapshot?: unknown; invoices?: unknown[]; error?: string }> {
  const res = await fetch(`${opsBaseUrl()}/api/internal/billing/clinic-billing-snapshot`, {
    headers: serviceHeaders(clinicId),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    snapshot?: unknown;
    invoices?: unknown[];
    error?: string;
  };
  if (!res.ok || !data.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, snapshot: data.snapshot, invoices: data.invoices };
}
