/**
 * Clinic OS — design tokens (code contract). Nasaq brand palette.
 * Tailwind mirrors these in tailwind.config.ts; keep both in sync when changing.
 */

export const clinicOsSpacingPx = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

export const clinicOsSpacingTw = {
  stackTight: "gap-cg-2",
  stackDefault: "gap-cg-4",
  panelGap: "gap-cg-5",
  sectionGap: "gap-cg-6",
} as const;

export const clinicOsMotion = {
  fast: "120ms",
  normal: "180ms",
  slow: "240ms",
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export const clinicOsMotionTw = {
  transition: "transition-all duration-ds-normal ease-ds-out",
  transitionFast: "transition-all duration-ds-fast ease-ds-out",
} as const;

export const clinicOsRadiusPx = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

export const clinicOsShadowCss = {
  sm: "0 1px 2px rgba(0,0,0,0.2)",
  md: "0 4px 12px rgba(0,0,0,0.3)",
} as const;

export const clinicOsType = {
  h1: { size: 28, weight: 600, lineHeight: 1.2 },
  h2: { size: 22, weight: 600, lineHeight: 1.2 },
  h3: { size: 18, weight: 500, lineHeight: 1.3 },
  body: { size: 14, weight: 400, lineHeight: 1.5 },
  small: { size: 12, weight: 400, lineHeight: 1.5 },
  label: { size: 11, weight: 500, lineHeight: 1.4 },
} as const;

/** Nasaq brand palette reference */
export const clinicOsPaletteReference = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceElevated: "#F1F5F9",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  primary: "#0D9488",
  primaryHover: "#0F766E",
  accent: "#2563EB",
  success: "#16A34A",
  warning: "#F59E0B",
  error: "#DC2626",
  info: "#0EA5E9",
  border: "#E2E8F0",
} as const;
