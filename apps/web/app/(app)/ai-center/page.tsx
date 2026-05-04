import { AlertTriangle, Bot, Brain, CircleGauge, TrendingUp } from "lucide-react";
import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactNumber, safePercent } from "@/lib/format";
import { fetchProductMetrics } from "@/lib/ops-server";

export default async function AiCenterPage() {
  const metricsData = await fetchProductMetrics().catch(() => ({ ok: false as const, data: {} }));
  const product = metricsData.ok ? ((metricsData.data as { product?: Record<string, unknown> }).product ?? {}) : {};
  const inboundTotal = Number(product.inbound_total ?? 0);
  const aiHandled = Number(product.ai_auto_replies ?? 0);
  const handoffRate = inboundTotal > 0 ? 100 - safePercent(aiHandled, inboundTotal) : 0;
  const automationRate = inboundTotal > 0 ? safePercent(aiHandled, inboundTotal) : 0;
  const modelName = (process.env.OLLAMA_MODEL || "").trim();

  return (
    <div className="flex flex-col gap-cg-5">
      <header className="flex flex-wrap items-end justify-between gap-cg-3">
        <div>
          <p className="text-ds-body text-muted-foreground">صحة النموذج والتحكم بالأتمتة</p>
          <h1 className="text-ds-h1 font-semibold tracking-tight">مركز الذكاء الاصطناعي</h1>
        </div>
      </header>

      <div className="grid gap-cg-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Bot} title="حالة المؤشرات" value={metricsData.ok ? "متصلة" : "غير متاحة"} />
        <MetricCard icon={Brain} title="النموذج المُعرَّف" value={modelName || "غير محدد"} />
        <MetricCard icon={CircleGauge} title="إجمالي الرسائل الواردة (الفترة)" value={formatCompactNumber(inboundTotal)} />
        <MetricCard icon={TrendingUp} title="حصة الرد الآلي" value={`${automationRate}%`} />
      </div>

      <div className="grid gap-cg-5 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-ds-h3 font-semibold">ردود مقترحة</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-cg-3 text-ds-body text-muted-foreground">
            <p>لا توجد اقتراحات مدمجة من واجهة ثابتة. استخدم صندوق المحادثات وسجلات الرسائل لمراجعة ما أرسله النظام فعليًا.</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-ds-h3 font-semibold">الإخفاقات والتحويل للموظف</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-cg-3 text-ds-body">
            <div className="flex items-center justify-between rounded-xl bg-danger/10 p-cg-3 text-danger">
              <span className="flex items-center gap-cg-2">
                <AlertTriangle className="h-4 w-4" />
                نسبة التحويل للموظف
              </span>
              <Badge variant="danger">{handoffRate}%</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-warning/10 p-cg-3 text-warning">
              <span>الردود الآلية</span>
              <Badge variant="warning">{automationRate}%</Badge>
            </div>
            <p className="text-muted-foreground">
              يتم أخذ الأرقام من مؤشرات المنتج على الخادم. لعرض سجل تفصيلي لكل رسالة (لماذا تم التحويل/لماذا فشل الرد)، يلزم واجهة قراءة مخصصة لاحقًا.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="flex items-center justify-between p-cg-5">
        <div>
          <p className="text-ds-body text-muted-foreground">{title}</p>
          <p className="mt-cg-2 text-ds-h3 font-semibold">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-content-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
