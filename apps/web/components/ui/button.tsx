import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-ds-body font-medium transition-[transform,box-shadow,background-color,color,filter] duration-ds-normal ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:brightness-110 hover:shadow-glow",
        brand:
          "nasaq-gradient text-white shadow-glow hover:brightness-105 hover:shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.4)]",
        secondary: "bg-secondary text-secondary-foreground hover:brightness-110 hover:shadow-sm",
        outline: "border border-border bg-background hover:bg-muted hover:shadow-sm",
        ghost: "hover:bg-muted/70",
        danger: "bg-danger text-white hover:brightness-110 hover:shadow-md",
      },
      size: {
        default: "h-10 px-cg-4 py-cg-2",
        sm: "h-9 rounded-lg px-cg-3",
        lg: "h-11 rounded-xl px-cg-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
