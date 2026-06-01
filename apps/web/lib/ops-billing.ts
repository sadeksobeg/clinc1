import "server-only";

function opsBaseUrl(): string | null {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  return u && u.length ? u : null;
}

function serviceHeaders(clinicId?: number): HeadersInit | null {
  const token = process.env.SCHEDULING_SERVICE_TOKEN?.trim();
  if (!token) return null;
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (clinicId && clinicId > 0) h["x-clinic-id"] = String(clinicId);
  return h;
}

export async function fetchOpsPricing(): Promise<{ ok: boolean; pricing?: unknown; error?: string }> {
  const base = opsBaseUrl();
  const headers = serviceHeaders();
  if (!base || !headers) return { ok: false, error: "OPS_DASHBOARD_URL is not set" };
  const res = await fetch(`${base}/api/internal/billing/pricing`, {
    headers,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; pricing?: unknown; error?: string };
  if (!res.ok || !data.ok) return { ok: false, error: data.error || res.statusText };
  return { ok: true, pricing: data.pricing };
}

export async function fetchOpsClinicBillingSnapshot(
  clinicId: number,
): Promise<{ ok: boolean; snapshot?: unknown; invoices?: unknown[]; error?: string }> {
  const base = opsBaseUrl();
  const headers = serviceHeaders(clinicId);
  if (!base || !headers) return { ok: false, error: "OPS_DASHBOARD_URL is not set" };
  const res = await fetch(`${base}/api/internal/billing/clinic-billing-snapshot`, {
    headers,
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
