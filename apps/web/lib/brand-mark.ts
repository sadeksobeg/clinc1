/** Shared SVG geometry for Nasaq logo mark (icon, Logo, OG). */
export const brandMarkViewBox = "0 0 48 48";

export const brandMarkGradientStops = [
  { offset: "0%", color: "#0D9488" },
  { offset: "48%", color: "#0891B2" },
  { offset: "100%", color: "#2563EB" },
] as const;

/** Three rhythm arcs + connection node — order, flow, 24/7 ops. */
export const brandMarkPaths = {
  arc1: "M10 31C10 22 24 16 38 24",
  arc2: "M10 26C10 17 24 11 38 19",
  arc3: "M10 21C10 12 24 6 38 14",
  node: "M38 14a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  highlight: "M14 10c6-4 16-4 22 0",
} as const;
