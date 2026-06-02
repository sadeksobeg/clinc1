"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LifeBuoy, LogOut, RefreshCw } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { fetchWithRetry } from "@/lib/fetch-retry";

const nav = [
  { href: "/support-agent", label: "طابور التذاكر", icon: LifeBuoy },
] as const;

export function SupportChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetchWithRetry("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/35">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-e border-border/70 bg-card/80 px-cg-4 py-cg-5 backdrop-blur-xl lg:flex lg:flex-col">
          <Link href="/support-agent" className="mb-cg-5 flex items-center gap-cg-3 rounded-2xl px-cg-3 py-cg-2 hover:bg-muted/70">
            <Logo variant="mark" size="sm" />
            <div>
              <p className="text-ds-body text-muted-foreground">دعم {brand.nameAr}</p>
              <p className="text-ds-h3 font-semibold">وحدة الدعم</p>
            </div>
          </Link>

          <nav className="flex flex-col gap-cg-1">
            {nav.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-cg-3 rounded-2xl px-cg-3 py-cg-3 text-ds-body transition-all",
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <p className="font-medium">{item.label}</p>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-cg-3 rounded-2xl border border-border/70 bg-muted/40 p-cg-4">
            <Button variant="outline" size="sm" onClick={() => router.refresh()} className="w-full justify-start gap-cg-2">
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
            <Separator />
            <Button variant="outline" size="sm" onClick={() => void handleLogout()} className="w-full justify-start gap-cg-2">
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </Button>
          </div>
        </aside>

        <main className="flex-1 px-cg-4 py-cg-6 lg:px-cg-6">{children}</main>
      </div>
    </div>
  );
}
