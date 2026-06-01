import "server-only";

/**
 * @deprecated Use `@/lib/ops-billing` for pricing and clinic billing snapshot.
 * Retained only if enterprise .NET billing endpoints are re-enabled via DOTNET_API_URL.
 */

/** Base URL of ClinicSaaS.Api (e.g. https://api.example.com or http://127.0.0.1:5080). */
function dotnetBaseUrl(): string | null {
  const u = process.env.DOTNET_API_URL?.replace(/\/$/, "");
  return u && u.length ? u : null;
}

export type PricingPreview = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

type JsonObj = Record<string, unknown>;

/** Anonymous pricing grid from .NET (`GET /api/subscriptions/pricing`). */
export async function fetchSubscriptionPricing(): Promise<PricingPreview> {
  const base = dotnetBaseUrl();
  if (!base) return { ok: false, error: "DOTNET_API_URL is not set" };
  try {
    const res = await fetch(`${base}/api/subscriptions/pricing`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { title?: string }).title || res.statusText };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

async function fetchJsonFromDotnet(path: string, init?: RequestInit): Promise<{ ok: boolean; data?: JsonObj; error?: string; status?: number }> {
  const base = dotnetBaseUrl();
  if (!base) return { ok: false, error: "DOTNET_API_URL is not set" };
  try {
    const res = await fetch(`${base}${path}`, { cache: "no-store", ...init });
    const data = (await res.json().catch(() => ({}))) as JsonObj;
    if (!res.ok) return { ok: false, status: res.status, error: (data.title as string) || res.statusText, data };
    return { ok: true, data, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

export async function fetchTenantCurrent() {
  return fetchJsonFromDotnet("/api/tenant/current");
}

export async function fetchTenantSubscription() {
  return fetchJsonFromDotnet("/api/tenant/subscription");
}

export async function fetchTenantInvoices() {
  return fetchJsonFromDotnet("/api/tenant/subscription/invoices");
}

export async function fetchTenantUsage() {
  return fetchJsonFromDotnet("/api/tenant/subscription/usage");
}
