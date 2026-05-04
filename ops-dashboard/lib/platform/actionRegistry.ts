import { getPool } from "@/lib/db";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RegistryAction = {
  action_type: string;
  risk_level: RiskLevel;
  requires_perm: string;
  auto_executable: boolean;
  execute: (args: {
    req: Request;
    pool: ReturnType<typeof getPool>;
    actionRow: any;
    reason: string;
  }) => Promise<void>;
  verify?: (args: { pool: ReturnType<typeof getPool>; actionRow: any }) => Promise<{ ok: boolean; metrics_after?: Record<string, unknown> }>;
};

export const actionRegistry: Record<string, RegistryAction> = {
  "clinic.suspend": {
    action_type: "clinic.suspend",
    risk_level: "high",
    requires_perm: "clinic.lifecycle.write",
    auto_executable: false,
    async execute({ req, actionRow, reason }) {
      const clinicId = Number(actionRow.clinic_id || 0);
      if (!clinicId) throw new Error("missing_clinic_id");
      const endpoint = new URL(`/api/internal/platform/clinics/${clinicId}/lifecycle`, req.url);
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify({ action: "suspend", reason }),
      });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok || !json || (json as any).ok !== true) throw new Error(String((json as any)?.error || "upstream_failed"));
    },
  },
  "clinic.activate": {
    action_type: "clinic.activate",
    risk_level: "medium",
    requires_perm: "clinic.lifecycle.write",
    auto_executable: false,
    async execute({ req, actionRow, reason }) {
      const clinicId = Number(actionRow.clinic_id || 0);
      if (!clinicId) throw new Error("missing_clinic_id");
      const endpoint = new URL(`/api/internal/platform/clinics/${clinicId}/lifecycle`, req.url);
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify({ action: "activate", reason }),
      });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok || !json || (json as any).ok !== true) throw new Error(String((json as any)?.error || "upstream_failed"));
    },
  },
  "incident.ack": {
    action_type: "incident.ack",
    risk_level: "low",
    requires_perm: "incident.ack",
    auto_executable: true,
    async execute({ req, actionRow }) {
      const incidentId = Number(actionRow.incident_id || 0);
      if (!incidentId) throw new Error("missing_incident_id");
      const endpoint = new URL(`/api/internal/platform/incidents/${incidentId}/ack`, req.url);
      const upstream = await fetch(endpoint, { method: "POST", headers: req.headers });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok || !json || (json as any).ok !== true) throw new Error(String((json as any)?.error || "upstream_failed"));
    },
  },
  "incident.resolve": {
    action_type: "incident.resolve",
    risk_level: "medium",
    requires_perm: "incident.resolve",
    auto_executable: false,
    async execute({ req, actionRow, reason }) {
      const incidentId = Number(actionRow.incident_id || 0);
      if (!incidentId) throw new Error("missing_incident_id");
      const endpoint = new URL(`/api/internal/platform/incidents/${incidentId}/resolve`, req.url);
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify({ resolution: reason }),
      });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok || !json || (json as any).ok !== true) throw new Error(String((json as any)?.error || "upstream_failed"));
    },
  },
  "system.toggle_runtime_flag": {
    action_type: "system.toggle_runtime_flag",
    risk_level: "critical",
    requires_perm: "system.emergency.write",
    auto_executable: false,
    async execute({ req, actionRow, reason }) {
      const endpoint = new URL("/api/internal/system/emergency/toggle", req.url);
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify({ ...(actionRow.payload || {}), reason }),
      });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok || !json || (json as any).ok !== true) throw new Error(String((json as any)?.error || "upstream_failed"));
    },
  },
};

