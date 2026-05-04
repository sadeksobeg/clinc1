"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/platform/AsyncState";
import { TableSkeleton, TableToolbar } from "@/components/platform/TableSkeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TicketRow = { id: number; clinic_id?: number; clinic_name?: string; subject: string; status: string; priority: string };

export default function PlatformSupportPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filter, setFilter] = useState("");
  const [errMsg, setErrMsg] = useState<string>("");

  async function load() {
    setStatus("loading");
    setErrMsg("");
    try {
      const res = await fetch("/api/ops/support/tickets?limit=100", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown; tickets?: unknown } | null;
      if (!res.ok || !json || json.ok !== true) {
        setStatus("error");
        setErrMsg(String(json?.error ?? "تعذر تحميل التذاكر."));
        return;
      }
      setTickets(Array.isArray(json.tickets) ? (json.tickets as TicketRow[]) : []);
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "تعذر الاتصال بالشبكة.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex flex-col gap-cg-5">
      <header className="flex flex-wrap items-end justify-between gap-cg-3">
        <div>
          <p className="text-ds-body text-muted-foreground">المنصة</p>
          <h1 className="text-ds-h1 font-semibold tracking-tight">الدعم (عام)</h1>
        </div>
        <p className="text-ds-small text-muted-foreground">التذاكر: {tickets.length}</p>
      </header>

      {status === "loading" ? <TableSkeleton rows={10} /> : null}
      {status === "error" ? <ErrorState title="تعذر تحميل الدعم" description={errMsg} onRetry={() => void load()} /> : null}

      {status === "success" ? (
        <div className="rounded-2xl border border-border bg-card p-cg-4">
          <TableToolbar
            title="آخر التذاكر"
            subtitle="جميع العيادات"
            right={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث بالعنوان/العيادة/الحالة" className="w-72" />}
          />
          <div className="mt-cg-3 flex flex-col gap-cg-2 text-ds-body">
            {tickets.length === 0 ? <p className="text-muted-foreground">لا توجد تذاكر.</p> : null}
            {tickets
              .filter((t) => {
                const q = filter.trim().toLowerCase();
                if (!q) return true;
                return (
                  String(t.subject || "").toLowerCase().includes(q) ||
                  String(t.clinic_name || "").toLowerCase().includes(q) ||
                  String(t.status || "").toLowerCase().includes(q) ||
                  String(t.priority || "").toLowerCase().includes(q)
                );
              })
              .slice(0, 100)
              .map((t) => (
              <div key={t.id} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                <p className="font-medium">
                  #{t.id} — {t.subject}
                </p>
                <p className="text-ds-small text-muted-foreground">
                  العيادة: {t.clinic_name ? `${t.clinic_name} (#${t.clinic_id})` : `#${t.clinic_id ?? "?"}`} • الحالة: {t.status} •
                  الأولوية: {t.priority}
                </p>
                {t.clinic_id ? (
                  <div className="mt-cg-2 flex flex-wrap gap-cg-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/platform/clinics/${t.clinic_id}?tab=support`}>فتح مركز العيادة</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

