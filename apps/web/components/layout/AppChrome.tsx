"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, Bell, Globe2, LayoutGrid, LogOut, Menu, Moon, Plus, Rows3, Search, Sun } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { brand } from "@/lib/brand";
import { useEffect, useState } from "react";
import { primaryNavigation } from "@/lib/navigation";
import { platformNavigation } from "@/lib/platform-navigation";
import { cn } from "@/lib/utils";
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { fetchWithRetry } from "@/lib/fetch-retry";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { density, direction, theme, workspaceMode, setWorkspaceMode, toggleDensity, toggleDirection, toggleTheme } = useUiPreferences();
  const [billingBanner, setBillingBanner] = useState<{ kind: "trial" | "locked"; text: string } | null>(null);
  const [billingSnapshot, setBillingSnapshot] = useState<{ status?: string; trial_days_left?: number; is_locked?: boolean } | null>(null);
  const [backendBanner, setBackendBanner] = useState<{ kind: "ops_down"; text: string } | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; body: string; read: boolean }>>([]);
  const [platformScope, setPlatformScope] = useState(false);
  const [actingClinicId, setActingClinicId] = useState<number | null>(null);
  const [clinicOptions, setClinicOptions] = useState<Array<{ clinic_id: number; clinic_name?: string | null }>>([]);
  const isOnPlatformRoute = pathname === "/platform" || pathname.startsWith("/platform/");
  const activeNavigation = platformScope && isOnPlatformRoute ? platformNavigation : primaryNavigation;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [meRes, contextRes] = await Promise.all([
          fetchWithRetry("/api/auth/me", { cache: "no-store" }),
          fetchWithRetry("/api/platform/context", { cache: "no-store" }),
        ]);
        const meJson = (await meRes.json().catch(() => ({}))) as { role?: string; scope?: string };
        const platform = meJson.scope === "platform";
        const contextJson = (await contextRes.json().catch(() => ({}))) as { acting_clinic_id?: number | null };
        const currentActingClinicId = Number(contextJson.acting_clinic_id || 0) || null;
        if (mounted) {
          setPlatformScope(platform);
          setActingClinicId(currentActingClinicId);
        }

        // In platform/global mode (no acting clinic), avoid calling tenant-scoped endpoints.
        const shouldLoadTenantScoped = !platform || Boolean(currentActingClinicId);

        if (platform) {
          const clinicsRes = await fetchWithRetry("/api/platform/clinics", { cache: "no-store" });
          const clinicsJson = (await clinicsRes.json().catch(() => ({}))) as {
            clinics?: Array<{ clinic_id: number; clinic_name?: string | null }>;
          };
          if (mounted) {
            const map = new Map<number, { clinic_id: number; clinic_name?: string | null }>();
            for (const c of clinicsJson.clinics ?? []) {
              if (!c || !Number.isFinite(Number(c.clinic_id))) continue;
              map.set(Number(c.clinic_id), { clinic_id: Number(c.clinic_id), clinic_name: c.clinic_name ?? null });
            }
            setClinicOptions(Array.from(map.values()));
          }
          if (!shouldLoadTenantScoped) {
            if (mounted) setNotifications([]);
            setBillingBanner(null);
            return;
          }
        }

        const [res, notifRes] = await Promise.all([
          fetchWithRetry("/api/ops/billing/local", { cache: "no-store" }),
          fetchWithRetry("/api/ops/notifications", { cache: "no-store" }),
        ]);
        const out = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          snapshot?: { status?: string; trial_days_left?: number; is_locked?: boolean };
        };
        const notifJson = (await notifRes.json().catch(() => ({}))) as {
          notifications?: Array<{ id: number; title: string; body: string; read: boolean }>;
        };
        if (mounted) setNotifications(notifJson.notifications ?? []);
        if (mounted) setBillingSnapshot(out.ok ? (out.snapshot ?? null) : null);
        if (!mounted || !out.ok || !out.snapshot) return;
        if (out.snapshot.is_locked) {
          if (mounted) setBillingSnapshot(out.snapshot);
          setBillingBanner({
            kind: "locked",
            text: "تم إيقاف الأتمتة بسبب انتهاء الفوترة. يرجى إرسال طلب دفع لإعادة التفعيل.",
          });
          return;
        }
        if (
          (out.snapshot.status === "trial_expiring" || out.snapshot.status === "trial") &&
          Number(out.snapshot.trial_days_left || 0) <= 2
        ) {
          if (mounted) setBillingSnapshot(out.snapshot);
          setBillingBanner({
            kind: "trial",
            text: `تنتهي الفترة التجريبية قريبًا (متبقي ${Number(out.snapshot.trial_days_left || 0)} يوم). قدّم طلب الدفع الآن.`,
          });
          return;
        }
        if (mounted) setBillingSnapshot(out.snapshot);
        setBillingBanner(null);
      } catch {
        // Ignore banner failures to keep shell stable.
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const probe = async () => {
      if (!platformScope || !isOnPlatformRoute) return;
      try {
        const res = await fetchWithRetry("/api/platform/system/state?ttl_ms=15000", { cache: "no-store" }, { retries: 0 });
        if (!mounted) return;
        if (res.status === 503) {
          setBackendBanner({
            kind: "ops_down",
            text: "Ops backend unavailable (ops-dashboard). Platform data may be stale.",
          });
          return;
        }
        setBackendBanner(null);
      } catch {
        if (!mounted) return;
        setBackendBanner({ kind: "ops_down", text: "Ops backend unreachable. Platform pages should show Retry." });
      }
    };
    void probe();
    const t = setInterval(() => void probe(), 15_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [platformScope, isOnPlatformRoute]);

  async function handleLogout() {
    try {
      await fetchWithRetry("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    }
    router.push("/login");
    router.refresh();
  }

  async function onPlatformContextChange(value: string) {
    const raw = String(value || "").trim();
    const parsed = raw === "global" ? 0 : Number(raw);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    const payload = { acting_clinic_id: next };
    await fetchWithRetry("/api/platform/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setActingClinicId(next);
    // Make the transition obvious + deterministic.
    // Global mode should land on /platform; clinic mode should land on /dashboard.
    router.push(next ? "/dashboard" : "/platform");
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="min-h-screen overflow-hidden bg-gradient-to-b from-background via-background to-muted/35"
    >
      <div className="flex min-h-screen overflow-hidden">
        <aside className="hidden w-[15.5rem] shrink-0 border-e border-border/70 bg-[hsl(var(--surface-sidebar))] px-cg-3 py-cg-5 lg:flex lg:flex-col">
          <Link href="/dashboard" className="mb-cg-6 flex items-center gap-cg-3 rounded-2xl px-cg-3 py-cg-2 hover:bg-muted/70">
            <Logo size="md" />
            <div className="min-w-0">
              <p className="text-ds-label text-muted-foreground">{brand.nameEn}</p>
              <p className="truncate text-ds-h3 font-semibold">{brand.nameAr}</p>
            </div>
          </Link>

          <nav className="flex flex-col gap-cg-1">
            {activeNavigation.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <motion.div key={item.href} whileHover={{ x: 4 }}>
                  <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-cg-3 rounded-lg border-e-2 px-cg-3 py-cg-2.5 text-ds-body transition-colors",
                    active
                      ? "app-sidebar-active font-medium"
                      : "border-e-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className={cn("text-ds-label", active ? "text-primary/80" : "text-muted-foreground/80")}>
                      {item.description}
                    </p>
                  </div>
                </Link>
                </motion.div>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-cg-4 rounded-2xl border border-border/70 bg-muted/40 p-cg-4">
            <div className="flex items-center gap-cg-3">
              <Avatar>
                <AvatarFallback>{brand.nameAr.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-ds-body font-medium">مساحة العمل</p>
                <p className="text-ds-small text-muted-foreground">{brand.taglineAr.slice(0, 42)}…</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Badge variant="secondary">
                {billingSnapshot?.is_locked
                  ? "موقوف"
                  : billingSnapshot?.status === "trial" || billingSnapshot?.status === "trial_expiring"
                    ? `تجريبي${Number.isFinite(Number(billingSnapshot?.trial_days_left)) ? ` (${Number(billingSnapshot?.trial_days_left || 0)} يوم)` : ""}`
                    : "نشط"}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
                onClick={() => void handleLogout()}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl">
            {backendBanner ? (
              <div className="flex items-center gap-cg-2 border-b border-border/60 bg-danger/10 px-cg-4 py-cg-2 text-ds-small text-danger md:px-cg-6">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">{backendBanner.text}</span>
                <Button size="sm" variant="outline" className="ms-auto h-7 px-cg-2" onClick={() => router.refresh()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {platformScope ? (
              <div className="flex items-center gap-cg-3 border-b border-border/60 bg-primary/5 px-cg-4 py-cg-2 text-ds-small md:px-cg-6">
                <Badge variant="secondary">Platform</Badge>
                <span className="text-muted-foreground">
                  {actingClinicId ? `Clinic mode: #${actingClinicId}` : "Global mode"}
                </span>
                {!actingClinicId ? <Badge variant="outline">Tenant calls blocked</Badge> : null}
                <div className="ms-auto min-w-56">
                  <div className="flex items-center justify-end gap-cg-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-cg-2"
                      disabled={!actingClinicId}
                      onClick={() => void onPlatformContextChange("global")}
                      title={actingClinicId ? "العودة إلى وضع الإدارة (بدون عيادة)" : "أنت بالفعل في وضع الإدارة"}
                    >
                      الخروج لوضع الإدارة
                    </Button>
                  <select
                    className="h-8 w-full min-w-56 rounded-xl border border-border bg-background px-cg-3 text-ds-small outline-none focus:ring-2 focus:ring-primary"
                    value={actingClinicId ? String(actingClinicId) : "global"}
                    onChange={(e) => void onPlatformContextChange(e.target.value)}
                  >
                    <option value="global">Global (بدون عيادة)</option>
                    {clinicOptions.map((c) => (
                      <option key={c.clinic_id} value={String(c.clinic_id)}>
                        {c.clinic_name ? `${c.clinic_name} (#${c.clinic_id})` : `Clinic #${c.clinic_id}`}
                      </option>
                    ))}
                  </select>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex h-16 items-center gap-cg-3 px-cg-4 md:px-cg-6">
              <Button variant="outline" size="sm" className="lg:hidden">
                <Menu className="h-4 w-4" />
              </Button>
              <div className="relative hidden max-w-lg flex-1 lg:block">
                <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="ابحث عن المرضى أو الأطباء أو المواعيد..." className="pe-10" />
              </div>

              <div className="ms-auto flex items-center gap-cg-2">
                <Button variant="outline" size="sm" onClick={toggleTheme}>
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <div
                  className="flex items-center rounded-xl border border-border/80 bg-muted/30 p-0.5"
                  role="group"
                  aria-label="وضع مسار العمل"
                >
                  {(["reception", "integrated", "doctor"] as const).map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant={workspaceMode === m ? "default" : "ghost"}
                      size="sm"
                      className="h-8 shrink-0 rounded-lg px-2.5"
                      onClick={() => setWorkspaceMode(m)}
                      title={
                        m === "reception"
                          ? "استقبال — لوحات التشغيل الكاملة والحجز السريع حيث يتوفر"
                          : m === "integrated"
                            ? "مدمج — نفس إمكانيات الاستقبال مع تخطيط موحّد (يمكن تخصيصه لاحقًا)"
                            : "طبيب — تركيز على المحادثة والجدول دون فتحات الحجز السريع"
                      }
                    >
                      <span className="text-ds-small">{m === "reception" ? "استقبال" : m === "integrated" ? "مدمج" : "طبيب"}</span>
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleDensity}
                  title={
                    density === "compact"
                      ? "التحويل إلى عرض مريح (بطاقات أوضح)"
                      : "كثافة عرض مضغوطة — مساحات أصغر للقوائم والبطاقات"
                  }
                  className="gap-1"
                >
                  {density === "compact" ? <LayoutGrid className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
                  <span className="text-ds-small">{density === "compact" ? "مضغوط" : "مريح"}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={toggleDirection}>
                  <Globe2 className="h-4 w-4" />
                  <span className="text-ds-small">{direction === "rtl" ? "يمين" : "يسار"}</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="relative">
                      <Bell className="h-4 w-4" />
                      {notifications.some((n) => !n.read) ? <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-danger" /> : null}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[200] w-80">
                    {notifications.length === 0 ? (
                      <DropdownMenuItem disabled>لا توجد إشعارات</DropdownMenuItem>
                    ) : (
                      notifications.map((n) => (
                        <DropdownMenuItem
                          key={n.id}
                          className="flex flex-col items-start gap-cg-1"
                          onClick={() => {
                            void fetch("/api/ops/notifications", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: n.id }),
                            }).then(() => setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))));
                          }}
                        >
                          <span className="text-ds-body font-medium">{n.title}</span>
                          <span className="text-ds-small text-muted-foreground">{n.body}</span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="gap-cg-2">
                      <Plus className="h-4 w-4" />
                      إجراءات سريعة
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[200]">
                    <DropdownMenuItem asChild>
                      <Link href="/inbox?tab=bookings">حجوزات واتساب (الصندوق)</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/inbox">صندوق المحادثات — الكل</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/patients">ملف المرضى — زيارة أو بحث سريع</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/appointments">المواعيد</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/billing">الفوترة</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-cg-4 md:p-cg-6">
            {billingBanner ? (
              <div
                className={cn(
                  "mb-cg-4 rounded-2xl border p-cg-3 text-ds-body",
                  billingBanner.kind === "locked"
                    ? "border-danger/40 bg-danger/5 text-danger"
                    : "border-warning/50 bg-warning/10 text-foreground dark:bg-warning/10",
                )}
              >
                <div className="flex items-center justify-between gap-cg-2">
                  <p>{billingBanner.text}</p>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/billing">فتح الفوترة</Link>
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </main>
          <Separator className="lg:hidden" />
          <nav className="sticky bottom-0 z-20 grid grid-cols-5 gap-cg-1 border-t border-border bg-background/95 p-cg-2 lg:hidden">
            {activeNavigation.slice(0, 5).map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-cg-1 rounded-xl py-cg-2 text-ds-label",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </motion.div>
  );
}
