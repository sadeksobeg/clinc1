import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/serverSession";
import { defaultLandingPath } from "@/lib/rbac/defaultLandingPath";

/** Legacy /staff — role-aware redirect (P1). */
export default async function StaffRedirectPage() {
  const session = await getServerSession();
  if (session?.role) {
    redirect(defaultLandingPath(session.role, session.scope));
  }
  redirect("/dashboard");
}
