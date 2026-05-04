"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/platform/AsyncState";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { ApiResponse } from "@/lib/api-response";
import { useQuery } from "@tanstack/react-query";

type SearchResult =
  | { type: "clinic"; clinic_id: number; clinic_name: string; slug?: string | null }
  | { type: "patient"; clinic_id: number; clinic_name: string; patient_id: number; display_name?: string | null; phone_e164?: string | null; chat_id?: string | null }
  | { type: "conversation"; clinic_id: number; clinic_name: string; conversation_id: number; chat_id: string; status?: string | null }
  | { type: "payment_request"; clinic_id: number; clinic_name: string; payment_request_id: number; status?: string | null; amount_usd?: number | null; payment_method?: string | null };

export default function PlatformSearchPage() {
  const action = useAsyncAction();
  const [q, setQ] = useState("");
  const query = q.trim();

  const searchQ = useQuery({
    queryKey: ["search", query],
    enabled: query.length >= 2,
    queryFn: async () => {
      const res = await fetch(`/api/platform/search?q=${encodeURIComponent(query)}&limit=20`, { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<{ ok: true; results: SearchResult[] }> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر البحث حاليا.");
      return Array.isArray(out.data?.results) ? out.data.results : [];
    },
  });

  const results = searchQ.data ?? [];
  const loading = searchQ.isFetching;
  const error = searchQ.error instanceof Error ? searchQ.error.message : "";

  const grouped = useMemo(() => {
    const by = new Map<string, SearchResult[]>();
    for (const r of results) {
      const k = r.type;
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    return by;
  }, [results]);

  return (
    <div className="flex flex-col gap-cg-5">
      <header className="flex flex-wrap items-end justify-between gap-cg-3">
        <div>
          <p className="text-ds-body text-muted-foreground">المنصة</p>
          <h1 className="text-ds-h1 font-semibold tracking-tight">بحث شامل</h1>
        </div>
        <Badge variant="secondary">{loading ? "جارٍ البحث..." : "جاهز"}</Badge>
      </header>

      <div className="flex flex-wrap gap-cg-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث: clinic name / phone / chat_id / conversation_id / payment_request_id" />
        <Button variant="outline" type="button" onClick={() => setQ("")}>
          مسح
        </Button>
      </div>

      <div className="flex flex-col gap-cg-4">
        {error ? <ErrorState title="تعذر البحث" description={error} onRetry={() => void searchQ.refetch()} /> : null}
        {Array.from(grouped.entries()).map(([type, rows]) => (
          <section key={type} className="rounded-2xl border border-border bg-card p-cg-4">
            <div className="flex items-center justify-between">
              <h2 className="text-ds-h2 font-semibold">
                {type === "clinic"
                  ? "عيادات"
                  : type === "patient"
                    ? "مرضى"
                    : type === "conversation"
                      ? "محادثات"
                      : type === "payment_request"
                        ? "طلبات دفع"
                        : type}
              </h2>
              <p className="text-ds-small text-muted-foreground">{rows.length}</p>
            </div>
            <div className="mt-cg-3 flex flex-col gap-cg-2 text-ds-body">
              {rows.slice(0, 20).map((r, idx) => (
                <div key={`${type}-${idx}`} className="rounded-xl border border-border/60 px-cg-3 py-cg-2">
                  {"clinic_id" in r ? (
                    <p className="text-ds-small text-muted-foreground">
                      العيادة: {r.clinic_name} (#{r.clinic_id})
                    </p>
                  ) : null}
                  {r.type === "clinic" ? (
                    <p className="font-medium">
                      #{r.clinic_id} — {r.clinic_name} {r.slug ? <span className="text-ds-small text-muted-foreground">({r.slug})</span> : null}
                    </p>
                  ) : null}
                  {r.type === "patient" ? (
                    <p className="font-medium">
                      المريض #{r.patient_id} — {r.display_name || "—"}{" "}
                      {r.phone_e164 ? <span className="text-ds-small text-muted-foreground">{r.phone_e164}</span> : null}
                    </p>
                  ) : null}
                  {r.type === "conversation" ? (
                    <p className="font-medium">
                      المحادثة #{r.conversation_id} — {r.chat_id}{" "}
                      {r.status ? <span className="text-ds-small text-muted-foreground">({r.status})</span> : null}
                    </p>
                  ) : null}
                  {r.type === "payment_request" ? (
                    <p className="font-medium">
                      طلب الدفع #{r.payment_request_id} — {String(r.status || "n/a")} — {Number(r.amount_usd || 0)}$
                    </p>
                  ) : null}

                  {"clinic_id" in r ? (
                    <div className="mt-cg-2 flex flex-wrap gap-cg-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.busy}
                        onClick={() =>
                          void action
                            .run(async (signal) => {
                              const res = await fetch("/api/platform/context", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ acting_clinic_id: r.clinic_id }),
                                signal,
                              });
                              if (!res.ok) throw new Error("تعذر تغيير سياق العيادة.");
                              window.location.assign("/dashboard");
                              return true;
                            })
                        }
                      >
                        دخول سياق العيادة
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/platform/clinics/${r.clinic_id}?tab=overview`}>فتح مركز العيادة</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/platform/clinics">قائمة العيادات</Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
        {query.length < 2 ? (
          <p className="text-ds-body text-muted-foreground">اكتب حرفين على الأقل للبحث.</p>
        ) : !loading && results.length === 0 && !error ? (
          <EmptyState title="No results" description="لا توجد نتائج مطابقة." />
        ) : null}
      </div>
    </div>
  );
}

