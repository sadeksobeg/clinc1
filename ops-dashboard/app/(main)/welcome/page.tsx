import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";
import { WelcomeOnboardingFlow } from "./WelcomeOnboardingFlow";

export default async function WelcomePage() {
  const session = await getSession();
  if (!session?.sub) redirect("/login");

  const clinicId = Number(session.clinicId ?? 0);
  const pool = getPool();
  const clinicR = clinicId > 0 ? await pool.query(`SELECT name, metadata FROM clinics WHERE id = $1`, [clinicId]) : { rows: [] };
  const clinicName = (clinicR.rows[0]?.name as string | undefined) || "عيادتك";
  const metadata = (clinicR.rows[0]?.metadata ?? {}) as Record<string, unknown>;
  if (metadata.onboarding_required !== true) {
    redirect("/inbox");
  }

  return <WelcomeOnboardingFlow clinicName={clinicName} />;
}
