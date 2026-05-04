import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      spacing: {
        "cg-0": "0",
        "cg-1": "4px",
        "cg-2": "8px",
        "cg-3": "12px",
        "cg-4": "16px",
        "cg-5": "24px",
        "cg-6": "32px",
        "cg-7": "48px",
        "cg-8": "64px",
        "stack-tight": "8px",
        "stack-default": "16px",
        "panel-gap": "24px",
        "section-gap": "32px",
      },
      fontSize: {
        "ds-h1": ["1.75rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "ds-h2": ["1.375rem", { lineHeight: "1.2" }],
        "ds-h3": ["1.125rem", { lineHeight: "1.3" }],
        "ds-body": ["0.875rem", { lineHeight: "1.5" }],
        "ds-small": ["0.75rem", { lineHeight: "1.5" }],
        "ds-label": ["0.6875rem", { lineHeight: "1.4", fontWeight: "500" }],
      },
      transitionDuration: {
        "ds-fast": "120ms",
        "ds-normal": "180ms",
        "ds-slow": "240ms",
      },
      transitionTimingFunction: {
        "ds-out": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "ds-sm": "0.375rem",
        "ds-md": "0.625rem",
        "ds-lg": "0.875rem",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        success: "hsl(var(--success))",
        danger: "hsl(var(--danger))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(37,99,235,0.08)",
        "ds-sm": "0 1px 2px rgba(0,0,0,0.2)",
        "ds-md": "0 4px 12px rgba(0,0,0,0.3)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
