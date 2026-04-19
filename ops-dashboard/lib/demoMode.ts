/** Server-side: block destructive demo actions when true. */
export function isDemoMode(): boolean {
  return String(process.env.DEMO_MODE || "").toLowerCase() === "true";
}

/** Exposed to client via NEXT_PUBLIC_DEMO_MODE for banner only. */
export function isDemoModePublic(): boolean {
  return String(process.env.NEXT_PUBLIC_DEMO_MODE || "").toLowerCase() === "true";
}
