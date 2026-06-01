/** Roles allowed to open /support-agent (platform or clinic support staff). */
export function canAccessSupportAgent(role: string, scope?: string): boolean {
  const r = role.toLowerCase();
  if (r === "super_admin" || r === "ops_admin" || r === "ops_manager") return true;
  if (scope === "platform" && (r === "support" || r === "support_agent")) return true;
  return r === "support" || r === "support_agent";
}

/** Roles allowed to open /staff (clinic administration). */
export function canAccessStaff(role: string, scope?: string): boolean {
  if (scope === "platform") return false;
  const r = role.toLowerCase();
  return ["admin", "secretary", "reception", "receptionist", "doctor", "ops_admin"].includes(r);
}
