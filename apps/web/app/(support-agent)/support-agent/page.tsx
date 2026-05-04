"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/platform/AsyncState";
import { TableSkeleton, TableToolbar } from "@/components/platform/TableSkeleton";

type TicketRow = {
  id: number;
  clinic_id?: number;
  clinic_name?: string;
  subject: string;
  status: "open" | "assigned" | "escalated" | "resolved" | string;
  priority: "low" | "normal" | "high" | "critical" | string;
  assigned_to?: number | null;
  sla?: { breach: boolean; first_response_overdue: boolean; deadline_overdue: boolean };
  created_at?: string;
  updated_at?: string;
};

function prBadge(p: string) {
  if (p === "critical") return <Badge variant="danger">حرج</Badge>;
  if (p === "high") return <Badge variant="secondary">عالي</Badge>;
  if (p === "normal") return <Badge variant="outline">عادي</Badge>;
  return <Badge variant="outline">منخفض</Badge>;
}

function statusBadge(s: string) {
  if (s === "open") return <Badge>مفتوحة</Badge>;
  if (s === "assigned") return <Badge variant="secondary">مسندة</Badge>;
  if (s === "escalated") return <Badge variant="danger">مصعّدة</Badge>;
  if (s === "resolved") return <Badge variant="outline">محلولة</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

export default function SupportAgentHome() {
  const [filter, setFilter] = useState("");
  const q = useQuery({
    queryKey: ["support-agent", "tickets"],
    queryFn: async () => {
      const res = await fetch("/api/ops/support/tickets?limit=200", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; tickets?: TicketRow[]; error?: string } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر تحميل التذاكر."));
      return Array.isArray(json.tickets) ? json.tickets : [];
    },
    refetchInterval: 15_000,
  });

  const tickets = q.data ?? [];
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return tickets;
    return tickets.filter((t) => {
      return (
        String(t.subject || "").toLowerCase().includes(f) ||
        String(t.status || "").toLowerCase().includes(f) ||
        String(t.priority || "").toLowerCase().includes(f) ||
        String(t.clinic_name || "").toLowerCase().includes(f) ||
        String(t.clinic_id || "").includes(f) ||
        String(t.id || "").includes(f)
      );
    });
  }, [tickets, filter]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">الدعم</p>
        <h1 className="text-3xl font-semibold tracking-tight">طابور التذاكر</h1>
      </header>

      {q.isLoading ? <TableSkeleton rows={12} /> : null}
      {q.isError ? (
        <ErrorState title="تعذر تحميل طابور الدعم" description={q.error instanceof Error ? q.error.message : "خطأ غير معروف"} onRetry={() => void q.refetch()} />
      ) : null}

      {q.isSuccess ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <TableToolbar
            title="التذاكر"
            subtitle="كل العيادات"
            right={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث بالعنوان/العيادة/الحالة/الأولوية" className="w-80" />}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
              تحديث
            </Button>
            <p className="text-xs text-muted-foreground">الإجمالي: {filtered.length}</p>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            {filtered.length === 0 ? <p className="text-muted-foreground">لا توجد تذاكر.</p> : null}
            {filtered.map((t) => (
              <Link
                key={t.id}
                href={`/support-agent/tickets/${t.id}`}
                className="block rounded-xl border border-border/60 px-3 py-2 hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    #{t.id} — {t.subject}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(String(t.status))}
                    {prBadge(String(t.priority))}
                    {t.sla?.breach ? <Badge variant="danger">SLA</Badge> : null}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  العيادة: {t.clinic_name ? `${t.clinic_name} (#${t.clinic_id})` : `#${t.clinic_id ?? "?"}`} • آخر تحديث:{" "}
                  {t.updated_at ? new Date(t.updated_at).toLocaleString("ar") : "—"}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

