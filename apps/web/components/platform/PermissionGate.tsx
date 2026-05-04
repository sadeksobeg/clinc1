"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PermissionGate(props: {
  allowed: boolean;
  perm: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (props.allowed) return <>{props.children}</>;

  return (
    <div className={cn("inline-flex items-center gap-2", props.className)}>
      <Button size="sm" variant="outline" disabled title={`Missing permission: ${props.perm}`}>
        Not allowed
      </Button>
      <span className="text-xs text-muted-foreground">Requires: {props.perm}</span>
    </div>
  );
}

