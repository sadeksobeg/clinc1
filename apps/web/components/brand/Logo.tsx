"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { BrandMarkSvg } from "@/components/brand/BrandMarkSvg";

type LogoProps = {
  className?: string;
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
  showEn?: boolean;
  /** Light mark on dark panels (login hero) */
  onDark?: boolean;
  /** Subtle arc pulse on the mark */
  animate?: boolean;
};

const sizes = {
  sm: { mark: 32, ar: "text-[15px]", en: "text-[10px]" },
  md: { mark: 40, ar: "text-lg", en: "text-[11px]" },
  lg: { mark: 52, ar: "text-xl", en: "text-xs" },
};

export function Logo({
  className,
  variant = "full",
  size = "md",
  showEn = false,
  onDark = false,
  animate = false,
}: LogoProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `nasaq-g-${uid}`;
  const glowId = `nasaq-gl-${uid}`;
  const s = sizes[size];

  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)} aria-label={brand.nameAr}>
        <BrandMarkSvg size={s.mark} gradId={gradId} glowId={glowId} animate={animate} className="shrink-0 drop-shadow-sm" />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <BrandMarkSvg size={s.mark} gradId={gradId} glowId={glowId} animate={animate} className="shrink-0 drop-shadow-sm" />
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
