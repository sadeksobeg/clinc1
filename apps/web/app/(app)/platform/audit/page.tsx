"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, EmptyState } from "@/components/platform/AsyncState";
import { TableSkeleton } from "@/components/platform/TableSkeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiResponse } from "@/lib/api-response";

type AuditLogRow = {
  id: number;
  clinic_id: number;
  actor_type: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type AuditSummaryRow = {
  action: string;
  total: number;
  error_count: number;
  avg_ms: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
};

export default function PlatformAuditPage() {
  const [clinicId, setClinicId] = useState<string>("0");
  const [limit, setLimit] = useState<string>("80");
  const [tab, setTab] = useState<"summary" | "logs">("logs");

  const auditQ = useQuery({
    queryKey: ["audit", { clinicId, limit }],
    queryFn: async () => {
      const res = await fetch(`/api/platform/audit?clinic_id=${encodeURIComponent(clinicId)}&limit=${encodeURIComponent(limit)}`, {
        cache: "no-store",
      });
      const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل السجل.");
      const upstream = out.data as Record<string, unknown>;
      return {
        logs: Array.isArray(upstream.logs) ? (upstream.logs as AuditLogRow[]) : ([] as AuditLogRow[]),
        summary: Array.isArray(upstream.summary) ? (upstream.summary as AuditSummaryRow[]) : ([] as AuditSummaryRow[]),
      };
    },
  });

  const logs = auditQ.data?.logs ?? [];
  const summary = auditQ.data?.summary ?? [];
  const errMsg = auditQ.error instanceof Error ? auditQ.error.message : "تعذر الاتصال بالشبكة.";

  const quickStats = useMemo(() => {
    const byAction = new Map<string, number>();
    for (const l of logs) byAction.set(l.action, (byAction.get(l.action) ?? 0) + 1);
    return Array.from(byAction.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [logs]);

  return (
    <div className="flex flex-col gap-cg-5">
      <header className="flex flex-wrap items-end justify-between gap-cg-3">
        <div>
          <p className="text-ds-body text-muted-foreground">المنصة</p>
          <h1 className="text-ds-h1 font-semibold tracking-tight">استعراض التدقيق</h1>
        </div>
        <Badge variant="secondary">{auditQ.isLoading ? "جارٍ التحميل..." : `${logs.length} سجل`}</Badge>
      </header>

      <div className="flex flex-wrap gap-cg-2">
        <Input value={clinicId} onChange={(e) => setClinicId(e.target.value)} placeholder="رقم العيادة (0 = الكل)" className="max-w-xs" />
        <Input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="الحد" className="max-w-[120px]" />
        <Button variant="outline" onClick={() => void auditQ.refetch()} disabled={auditQ.isFetching}>
          تحديث
        </Button>
      </div>

      {auditQ.isLoading ? <TableSkeleton rows={8} /> : null}
      {auditQ.isError ? <ErrorState title="تعذر تحميل التدقيق" description={errMsg} onRetry={() => void auditQ.refetch()} /> : null}

      <div className="flex flex-wrap gap-cg-2">
        {quickStats.map(([action, count]) => (
          <Badge key={action} variant="outline">
            {action}: {count}
          </Badge>
        ))}
      </div>

      {auditQ.isSuccess && logs.length === 0 ? (
        <EmptyState
          title="لا توجد سجلات تدقيق بعد"
          description="هذا يعني أنه لم يتم تنفيذ عمليات (Writes) كفاية، أو أن النظام جديد. عند تنفيذ أي إجراء (مثل تفعيل/تعطيل خدمة أو إرسال إشعار) سيظهر هنا فورًا."
        />
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v === "summary" ? "summary" : "logs")}>
        <TabsList className="w-fit">
          <TabsTrigger value="logs">السجل</TabsTrigger>
          <TabsTrigger value="summary">ملخص 24 ساعة</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="text-ds-h3">أعلى عمليات (p95) خلال 24 ساعة</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.length === 0 ? (
                <p className="text-ds-body text-muted-foreground">لا يوجد ملخص أداء بعد (يتطلب وجود `duration_ms` في payload).</p>
              ) : (
                <div className="flex flex-col gap-cg-2">
                  {summary.slice(0, 20).map((s) => (
                    <div key={s.action} className="flex flex-wrap items-center justify-between gap-cg-2 rounded-xl border border-border/70 bg-muted/10 px-cg-3 py-cg-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{s.action}</p>
                        <p className="text-ds-small text-muted-foreground">إجمالي={s.total} • أخطاء={s.error_count}</p>
                      </div>
                      <div className="flex items-center gap-cg-2 text-ds-small">
                        <Badge variant="outline">avg={s.avg_ms ?? "—"}ms</Badge>
                        <Badge variant="outline">p50={s.p50_ms ?? "—"}ms</Badge>
                        <Badge variant="secondary">p95={s.p95_ms ?? "—"}ms</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <div className="flex flex-col gap-cg-2">
            {logs.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-card p-cg-4">
                <div className="flex flex-wrap items-center justify-between gap-cg-2">
                  <p className="font-semibold">{l.action}</p>
                  <p className="text-ds-small text-muted-foreground">{new Date(l.created_at).toLocaleString("ar")}</p>
                </div>
                <p className="text-ds-small text-muted-foreground">
                  العيادة={l.clinic_id} • المنفذ={l.actor_type}:{l.actor_id ?? "—"} • الكيان={l.entity_type ?? "—"}:{l.entity_id ?? "—"}
                </p>
                {l.payload ? (
                  <pre className="mt-cg-2 max-h-56 overflow-auto rounded-xl border border-border/60 bg-muted/20 p-cg-2 text-ds-small text-muted-foreground">
                    {JSON.stringify(l.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

