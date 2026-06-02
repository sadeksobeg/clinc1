import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";

type LogoProps = {
  className?: string;
  /** full = mark + wordmark, mark = icon only */
  variant?: "full" | "mark";
  /** sm | md | lg */
  size?: "sm" | "md" | "lg";
  showEn?: boolean;
};

const sizes = {
  sm: { mark: 28, text: "text-sm" },
  md: { mark: 36, text: "text-base" },
  lg: { mark: 44, text: "text-lg" },
};

function LogoMark({ size }: { size: number }) {
  const id = "nasaq-grad";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="4" y1="36" x2="36" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0D9488" />
          <stop offset="0.5" stopColor="#0891B2" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${id})`} />
      <path
        d="M12 26V14h4.2c3.2 0 5.4 1.8 5.4 4.6 0 2.1-1.1 3.6-2.9 4.2L22 26h-3.4l-2.6-6.4H15.2V26H12zm3.2-9.2h1c1.5 0 2.4-.8 2.4-2s-.9-2-2.4-2h-1v4zM24 26l5-12h3.4l-5.6 13.2c-.8 1.8-2 2.8-4 2.8H24V26z"
        fill="white"
        fillOpacity="0.95"
      />
    </svg>
  );
}

export function Logo({ className, variant = "full", size = "md", showEn = false }: LogoProps) {
  const s = sizes[size];
  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)} aria-label={brand.nameAr}>
        <LogoMark size={s.mark} />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={s.mark} />
      <span className="flex flex-col leading-tight">
        <span className={cn("font-bold tracking-tight text-foreground", s.text)}>{brand.nameAr}</span>
        {showEn ? <span className="text-ds-label text-muted-foreground">{brand.nameEn}</span> : null}
      </span>
    </span>
  );
}
