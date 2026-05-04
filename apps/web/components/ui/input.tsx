import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      suppressHydrationWarning
      className={cn(
        "flex h-10 w-full rounded-xl border border-border bg-background px-cg-3 py-cg-2 text-ds-body ring-offset-background",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
