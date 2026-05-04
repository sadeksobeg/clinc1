export type PlatformPerms = { role: string; perms: string[] };

export function hasPerm(perms: PlatformPerms | null | undefined, perm: string): boolean {
  if (!perms) return false;
  if (perms.perms.includes("*")) return true;
  return perms.perms.includes(perm);
}

