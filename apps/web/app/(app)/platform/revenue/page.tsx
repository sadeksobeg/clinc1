import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { LocalOpsRevenueProvider } from "@/lib/platform/providers/revenueProvider";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function PlatformRevenuePage() {
  const provider = new LocalOpsRevenueProvider();
  const snap = await provider.getSnapshot().catch(() => null);
  const s = snap?.summary;
  const clinics = snap?.clinics ?? [];

  return (
    <div className="flex flex-col gap-cg-5">
      <header className="flex flex-wrap items-end justify-between gap-cg-3">
        <div>
          <p className="text-ds-body text-muted-foreground">المنصة</p>
          <h1 className="text-ds-h1 font-semibold tracking-tight">مركز الإيرادات</h1>
        </div>
        <p className="text-ds-small text-muted-foreground">المصدر: فوترة محلية (Ops)</p>
      </header>

      <div className="grid gap-cg-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="pb-cg-2">
            <CardTitle className="text-ds-body">MRR المتوقع</CardTitle>
          </CardHeader>
          <CardContent className="text-ds-h3 font-semibold">{formatCurrency(Number(s?.projected_mrr_usd || 0))}</CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-cg-2">
            <CardTitle className="text-ds-body">طلبات معلّقة</CardTitle>
          </CardHeader>
          <CardContent className="text-ds-h3 font-semibold">{Number(s?.pending_requests || 0)}</CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-cg-2">
            <CardTitle className="text-ds-body">طلبات متأخرة</CardTitle>
          </CardHeader>
          <CardContent className="text-ds-h3 font-semibold">{Number(s?.overdue_requests || 0)}</CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-cg-2">
            <CardTitle className="text-ds-body">معتمد (هذا الشهر)</CardTitle>
          </CardHeader>
          <CardContent className="text-ds-h3 font-semibold">{formatCurrency(Number(s?.approved_total_usd || 0))}</CardContent>
        </Card>
      </div>

      <section className="rounded-2xl border border-border bg-card p-cg-4">
        <h2 className="text-ds-h2 font-semibold">عيادة بعيادة</h2>
        <p className="mt-cg-1 text-ds-body text-muted-foreground">أفضل 50 حسب إجمالي شهري تقديري.</p>
        <div className="mt-cg-3 flex flex-col gap-cg-2 text-ds-body">
          {clinics.length === 0 ? <p className="text-muted-foreground">لا توجد بيانات إيرادات.</p> : null}
          {clinics.slice(0, 50).map((c) => (
            <div key={c.clinic_id} className="flex flex-wrap items-center justify-between gap-cg-2 rounded-xl border border-border/60 px-cg-3 py-cg-2">
              <div>
                <p className="font-medium">
                  #{c.clinic_id} — {c.clinic_name}
                </p>
                <p className="text-ds-small text-muted-foreground">
                  الحالة={c.status} • الأطباء={Number(c.doctor_count || 0)} • التجديد=
                  {c.next_renewal_at ? new Date(c.next_renewal_at).toLocaleDateString("ar") : "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-cg-2">
                <p className="text-ds-body font-semibold">{formatCurrency(Number(c.estimated_monthly_total_usd || 0))}</p>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/platform/clinics/${c.clinic_id}?tab=billing`}>فتح مركز العيادة</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!snap ? <p className="text-ds-body text-muted-foreground">تعذر تحميل لقطة الإيرادات الآن.</p> : null}
    </div>
  );
}

