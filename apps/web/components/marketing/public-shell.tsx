"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/features", label: "المميزات" },
  { href: "/pricing", label: "الأسعار" },
  { href: "/trial", label: "تجربة مجانية" },
  { href: "/demo", label: "طلب عرض" },
  { href: "/contact", label: "تواصل" },
];

export function PublicShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const active = useMemo(() => pathname, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground sm:text-sm">
        ابدأ الآن - 3 أيام مجانية بدون بطاقة دفع
      </div>
      <header className="sticky top-0 z-40 border-b border-white/30 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            كلينك ساس
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm text-muted-foreground transition hover:text-foreground",
                  active === item.href && "text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost">
              <Link href="/login">دخول</Link>
            </Button>
            <Button asChild>
              <Link href="/trial">ابدأ مجانا</Link>
            </Button>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="فتح القائمة">
                <Menu className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>القائمة</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded-xl border px-3 py-2 text-sm">
                    {item.label}
                  </Link>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button asChild variant="ghost">
                    <Link href="/login">دخول</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/trial">ابدأ مجانا</Link>
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {title ? (
        <section className="mx-auto max-w-7xl px-4 pb-3 pt-12 sm:px-6">
          <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        </section>
      ) : null}

      <main>{children}</main>

      <div className="fixed inset-x-0 bottom-3 z-40 mx-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur md:hidden">
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <Link href="/demo">احجز عرض</Link>
          </Button>
          <Button asChild>
            <Link href="/trial">ابدأ مجانا</Link>
          </Button>
        </div>
      </div>

      <footer className="mt-20 border-t bg-muted/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-3 sm:px-6">
          <div>
            <p className="text-lg font-bold">كلينك ساس</p>
            <p className="mt-2 text-sm text-muted-foreground">
              منصة تشغيل عيادات متقدمة مع واتساب ذكي، حجز، ومتابعة مرضى في تجربة واحدة.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">روابط</p>
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="block text-muted-foreground hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">تواصل</p>
            <p className="text-muted-foreground">واتساب: +966 55 000 0000</p>
            <p className="text-muted-foreground">البريد الإلكتروني: hello@clinicsaas.app</p>
            <p className="text-muted-foreground">© {new Date().getFullYear()} كلينك ساس</p>
          </div>
        </div>
      </footer>
      {!isHome ? <div className="h-20 md:hidden" /> : null}
    </div>
  );
}
