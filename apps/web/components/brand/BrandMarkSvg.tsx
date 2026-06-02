import type { CSSProperties } from "react";
import { useId } from "react";
import { brandMarkPaths, brandMarkViewBox } from "@/lib/brand-mark";

type BrandMarkSvgProps = {
  size?: number;
  className?: string;
  gradId?: string;
  glowId?: string;
  /** Subtle pulse on connection node (favicon / hero) */
  animate?: boolean;
};

export function BrandMarkSvg({
  size = 48,
  className,
  gradId = "nasaq-grad",
  glowId = "nasaq-glow",
  animate = false,
}: BrandMarkSvgProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={brandMarkViewBox}
      fill="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0D9488" />
          <stop offset="0.45" stopColor="#0891B2" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <radialGradient id={glowId} cx="0.3" cy="0.25" r="0.65">
          <stop stopColor="white" stopOpacity="0.38" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gradId})`} />
      <rect width="48" height="48" rx="14" fill={`url(#${glowId})`} />
      <path
        d={brandMarkPaths.arc1}
        stroke="white"
        strokeWidth="2.85"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
        className={animate ? "brand-mark-arc brand-mark-arc-1" : undefined}
      />
      <path
        d={brandMarkPaths.arc2}
        stroke="white"
        strokeWidth="2.85"
        strokeLinecap="round"
        fill="none"
        opacity="0.82"
        className={animate ? "brand-mark-arc brand-mark-arc-2" : undefined}
      />
      <path
        d={brandMarkPaths.arc3}
        stroke="white"
        strokeWidth="2.85"
        strokeLinecap="round"
        fill="none"
        className={animate ? "brand-mark-arc brand-mark-arc-3" : undefined}
      />
      <circle cx="38" cy="14" r="4.5" fill="white" className={animate ? "brand-mark-node" : undefined} />
      <circle cx="38" cy="14" r="2.2" fill="#0891B2" opacity="0.95" />
    </svg>
  );
}

/** Static SVG string for favicon files (no React). */
export function brandMarkSvgStatic(opts?: { animate?: boolean }): string {
  const animate = opts?.animate ?? false;
  const pulse = animate
    ? `<circle cx="38" cy="14" r="4.5" fill="white"><animate attributeName="opacity" values="1;0.65;1" dur="2.4s" repeatCount="indefinite"/></circle>`
    : `<circle cx="38" cy="14" r="4.5" fill="white"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <defs>
    <linearGradient id="g" x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0D9488"/><stop offset="0.45" stop-color="#0891B2"/><stop offset="1" stop-color="#2563EB"/>
    </linearGradient>
    <radialGradient id="gl" cx="0.3" cy="0.25" r="0.65">
      <stop stop-color="white" stop-opacity="0.38"/><stop offset="1" stop-color="white" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="48" height="48" rx="14" fill="url(#g)"/>
  <rect width="48" height="48" rx="14" fill="url(#gl)"/>
  <path d="${brandMarkPaths.arc1}" stroke="white" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.55"/>
  <path d="${brandMarkPaths.arc2}" stroke="white" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.82"/>
  <path d="${brandMarkPaths.arc3}" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/>
  ${pulse}
  <circle cx="38" cy="14" r="2.2" fill="#0891B2"/>
</svg>`;
}

export function BrandMarkFloating({ style, className }: { style?: CSSProperties; className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <div className={className} style={style} aria-hidden>
      <BrandMarkSvg size={56} gradId={`fg-${uid}`} glowId={`fl-${uid}`} animate />
    </div>
  );
}
