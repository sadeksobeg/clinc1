import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";

export default async function Home() {
  const s = await getSession();
  if (s) {
    const clinicId = Number(s.clinicId ?? 0);
    if (clinicId > 0) {
      const pool = getPool();
      const r = await pool.query(`SELECT metadata FROM clinics WHERE id = $1`, [clinicId]);
      const meta = (r.rows[0]?.metadata ?? {}) as Record<string, unknown>;
      if (meta.onboarding_required === true) {
        redirect("/welcome");
      }
    }
    redirect("/inbox");
  }
  redirect("/login");
}
