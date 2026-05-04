import type { Pool } from "pg";

/** Resolved .NET tenant UUID for a CRM clinic, if linked. */
export async function getTenantGuidForClinic(pool: Pool, clinicId: number): Promise<string | null> {
  try {
    const r = await pool.query(`SELECT tenant_guid::text AS g FROM clinic_saas_tenant_links WHERE clinic_id = $1`, [
      clinicId,
    ]);
    const g = r.rows[0]?.g as string | undefined;
    return g && g.length ? g : null;
  } catch {
    return null;
  }
}
