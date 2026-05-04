import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const SelectValue = SelectPrimitive.Value;

// Radix Select: keep default root — ارتفاع z-index على SelectContent يقلل تعارض الطبقات مع sticky.
export function Select(props: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />;
}

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, type, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-xl border border-border bg-background px-cg-3 py-cg-2 text-ds-body",
      "focus:outline-none focus:ring-2 focus:ring-primary",
      className,
    )}
    {...props}
    // If this trigger is rendered inside a <form>, defaulting to submit breaks opening.
    // Force button type unless explicitly provided.
    type={type ?? "button"}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn("z-[200] min-w-[8rem] rounded-xl border border-border bg-card text-card-foreground shadow-xl", className)}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-cg-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-lg py-cg-2 ps-cg-6 pe-cg-2 text-ds-body outline-none focus:bg-muted",
      className,
    )}
    {...props}
  >
    <span className="absolute start-cg-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
