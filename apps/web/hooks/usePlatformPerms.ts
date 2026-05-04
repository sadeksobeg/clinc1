"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse } from "@/lib/api-response";

export function usePlatformPerms() {
  return useQuery({
    queryKey: ["platform-perms"],
    queryFn: async () => {
      const res = await fetch("/api/platform/permissions", { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<{ role: string; perms: string[] }> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "Failed to load permissions");
      return { role: out.data.role, perms: out.data.perms };
    },
  });
}

