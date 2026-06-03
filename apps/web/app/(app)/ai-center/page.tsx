import { AlertTriangle, Bot, Brain, CircleGauge, Sparkles, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactNumber, safePercent } from "@/lib/format";
import { fetchInboxRows, fetchProductMetrics } from "@/lib/ops-server";
import { getServerClinicIdOrThrow } from "@/lib/serverSession";

export default async function AiCenterPage() {
  const clinicId = await getServerClinicIdOrThrow();
  const [metricsData, inboxData] = await Promise.all([
    fetchProductMetrics().catch(() => ({ ok: false as const, data: {} })),
    fetchInboxRows(clinicId).catch(() => ({ ok: false as const, rows: [] })),
  ]);
  const product = metricsData.ok ? ((metricsData.data as { product?: Record<string, unknown> }).product ?? {}) : {};
  const inboundTotal = Number(product.inbound_total ?? 0);
  const aiHandled = Number(product.ai_auto_replies ?? 0);
  const handoffCount = (inboxData.ok ? inboxData.rows ?? [] : []).filter(
    (r) => String(r.state || "").toUpperCase() === "PENDING_HANDOFF",
  ).length;
  const handoffRate = inboundTotal > 0 ? 100 - safePercent(aiHandled, inboundTotal) : 0;
  const automationRate = inboundTotal > 0 ? safePercent(aiHandled, inboundTotal) : 0;
  const modelName = (process.env.EXTERNAL_AI_URL || process.env.OLLAMA_MODEL || "").trim() || "Heuristic (محلي)";
  const adapterMode = (process.env.EXTERNAL_AI_URL || "").trim() ? "External AI" : "Heuristic + Ollama";

  return (
    <div className="flex flex-col gap-cg-5">
      <PageHeader subtitle="نسق — الذكاء الاصطناعي" title="مركز الذكاء الاصطناعي" description="صحة الموديل، الثقة، ونسبة التحويل للموظف" />

      <div className="grid gap-cg-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="محول AI" value={adapterMode} icon={Brain} />
        <StatCard label="أتمتة الردود" value={`${automationRate}%`} hint={`${formatCompactNumber(aiHandled)} رد`} icon={TrendingUp} tone="ai" />
        <StatCard label="تحويل بشري" value={handoffCount} hint={`${handoffRate}% من الوارد`} icon={Sparkles} />
        <StatCard label="رسائل واردة" value={formatCompactNumber(inboundTotal)} icon={CircleGauge} />
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
