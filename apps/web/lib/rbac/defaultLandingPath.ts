/**
 * Post-login landing paths by role (P1-CORE navigation).
 */
export function defaultLandingPath(role: string, scope?: string): string {
  const r = role.toLowerCase();
  const s = (scope || "").toLowerCase();

  if (r === "super_admin" && s === "platform") {
    return "/platform";
  }
  if (r === "doctor") {
    return "/doctor";
  }
  if (r === "reception" || r === "receptionist" || r === "secretary") {
    return "/inbox";
  }
  if (r === "admin") {
    return "/dashboard";
  }
  return "/dashboard";
}
