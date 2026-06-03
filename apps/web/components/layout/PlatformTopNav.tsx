"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, AlertTriangle, Building2, LifeBuoy, MessageCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/platform", label: "نظرة عامة", icon: Activity, exact: true },
  { href: "/platform/clinics", label: "العيادات", icon: Building2 },
  { href: "/platform/whatsapp-routing", label: "واتساب", icon: MessageCircle },
  { href: "/platform/incidents", label: "حوادث", icon: AlertTriangle },
  { href: "/platform/revenue", label: "الإيرادات", icon: TrendingUp },
  { href: "/platform/support", label: "الدعم", icon: LifeBuoy },
];

export function PlatformTopNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-cg-1 border-b border-border/50 pb-cg-3">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-cg-1.5 rounded-lg px-cg-3 py-cg-2 text-[13px] transition-colors",
              active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
