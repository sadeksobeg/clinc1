/** Whether super-admin IP allowlist checks are bypassed (dev/setup only). Never true in production. */
export function superAdminIpAllowlistBypassEnabled(): boolean {
  const raw = String(process.env.SUPERADMIN_IP_ALLOWLIST_DISABLED || "").trim().toLowerCase();
  const requested = ["1", "true", "yes"].includes(raw);
  if (!requested) return false;
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return true;
}
