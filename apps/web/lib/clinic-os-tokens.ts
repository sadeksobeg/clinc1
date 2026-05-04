/**
 * Clinic OS — design tokens (code contract).
 * Tailwind mirrors these values in tailwind.config.ts; keep both in sync when changing.
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

/** Tailwind: cg-0 … cg-8 */
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

/** Tailwind: duration-ds-fast | ease-ds-out */
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

/** Typography scale (px). Tailwind: text-ds-h1 … text-ds-label */
export const clinicOsType = {
  h1: { size: 28, weight: 600, lineHeight: 1.2 },
  h2: { size: 22, weight: 600, lineHeight: 1.2 },
  h3: { size: 18, weight: 500, lineHeight: 1.3 },
  body: { size: 14, weight: 400, lineHeight: 1.5 },
  small: { size: 12, weight: 400, lineHeight: 1.5 },
  label: { size: 11, weight: 500, lineHeight: 1.4 },
} as const;

/** Hex reference for docs / exports — UI uses HSL CSS variables */
export const clinicOsPaletteReference = {
  bg: "#0B1220",
  surface: "#111827",
  surfaceElevated: "#1F2937",
  textPrimary: "#F9FAFB",
  textSecondary: "#9CA3AF",
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  success: "#16A34A",
  warning: "#F59E0B",
  error: "#DC2626",
  info: "#38BDF8",
  border: "#1F2937",
} as const;
