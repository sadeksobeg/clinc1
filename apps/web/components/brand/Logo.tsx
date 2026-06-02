"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { brandMarkPaths, brandMarkViewBox } from "@/lib/brand-mark";

type LogoProps = {
  className?: string;
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
  showEn?: boolean;
  /** Light mark on dark panels (login hero) */
  onDark?: boolean;
};

const sizes = {
  sm: { mark: 32, ar: "text-[15px]", en: "text-[10px]" },
  md: { mark: 40, ar: "text-lg", en: "text-[11px]" },
  lg: { mark: 52, ar: "text-xl", en: "text-xs" },
};

function LogoMark({ size, gradId, glowId }: { size: number; gradId: string; glowId: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={brandMarkViewBox}
      fill="none"
      aria-hidden
      className="shrink-0 drop-shadow-sm"
    >
      <defs>
        <linearGradient id={gradId} x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0D9488" />
          <stop offset="0.45" stopColor="#0891B2" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <radialGradient id={glowId} cx="0.3" cy="0.25" r="0.65">
          <stop stopColor="white" stopOpacity="0.35" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gradId})`} />
      <rect width="48" height="48" rx="14" fill={`url(#${glowId})`} />
      <path
        d={brandMarkPaths.arc1}
        stroke="white"
        strokeWidth="2.75"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
      <path d={brandMarkPaths.arc2} stroke="white" strokeWidth="2.75" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d={brandMarkPaths.arc3} stroke="white" strokeWidth="2.75" strokeLinecap="round" fill="none" />
      <circle cx="38" cy="14" r="4" fill="white" />
      <circle cx="38" cy="14" r="2" fill="#0891B2" opacity="0.9" />
    </svg>
  );
}

export function Logo({ className, variant = "full", size = "md", showEn = false, onDark = false }: LogoProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `nasaq-g-${uid}`;
  const glowId = `nasaq-gl-${uid}`;
  const s = sizes[size];

  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)} aria-label={brand.nameAr}>
        <LogoMark size={s.mark} gradId={gradId} glowId={glowId} />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark size={s.mark} gradId={gradId} glowId={glowId} />
      <span className="flex flex-col justify-center leading-none">
        <span
          className={cn(
            "font-bold tracking-tight",
            s.ar,
            onDark ? "text-white" : "text-foreground",
          )}
        >
          {brand.nameAr}
        </span>
        {showEn ? (
          <span
            className={cn(
              "mt-0.5 font-semibold uppercase tracking-[0.2em]",
              s.en,
              onDark ? "text-white/75" : "text-muted-foreground",
            )}
          >
            {brand.nameEn}
          </span>
        ) : null}
      </span>
    </span>
  );
}
