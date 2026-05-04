"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/platform/AsyncState";
import { TableSkeleton, TableToolbar } from "@/components/platform/TableSkeleton";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useSafetyDialog } from "@/components/platform/SafetyDialogProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiResponse } from "@/lib/api-response";

type TicketRow = {
  id: number;
  clinic_id?: number;
  clinic_name?: string;
  subject: string;
  status: string;
  priority: string;
  assigned_to?: number | null;
  updated_at?: string | null;
};

type MessageRow = {
  id: number;
  ticket_id: number;
  sender_user_id: number | null;
  sender_role: string;
  body: string;
  is_internal_note: boolean;
  created_at: string;
};

type ClinicSummary = {
  clinic_id: number;
  clinic: { clinic_id: number; clinic_name: string; slug: string | null };
  billing: any;
  health: any;
  tickets: any;
};

export default function SupportTicketPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = Number(params?.id || 0);
  const action = useAsyncAction();
  const safety = useSafetyDialog();
  const [body, setBody] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [macroNote, setMacroNote] = useState(false);

  const ticketsQ = useQuery({
    queryKey: ["support-agent", "tickets"],
    queryFn: async () => {
      const res = await fetch("/api/ops/support/tickets?limit=200", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; tickets?: TicketRow[]; error?: string } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر تحميل التذاكر."));
      return Array.isArray(json.tickets) ? json.tickets : [];
    },
  });

  const ticket = useMemo(() => {
    return (ticketsQ.data ?? []).find((t) => Number(t.id) === ticketId) ?? null;
  }, [ticketsQ.data, ticketId]);

  const messagesQ = useQuery({
    queryKey: ["support-agent", "ticket-messages", ticketId],
    enabled: ticketId > 0,
    queryFn: async () => {
      const res = await fetch(`/api/ops/support/messages?ticket_id=${ticketId}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; messages?: MessageRow[]; error?: string } | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر تحميل الرسائل."));
      return Array.isArray(json.messages) ? json.messages : [];
    },
    refetchInterval: 10_000,
  });

  const clinicSummaryQ = useQuery({
    queryKey: ["support-agent", "clinic-summary", ticket?.clinic_id || 0],
    enabled: Boolean(ticket?.clinic_id),
    queryFn: async () => {
      const clinicId = Number(ticket?.clinic_id || 0);
      const res = await fetch(`/api/platform/clinics/${clinicId}/summary`, { cache: "no-store" });
      const out = (await res.json().catch(() => null)) as ApiResponse<ClinicSummary> | null;
      if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر تحميل سياق العيادة.");
      return out.data;
    },
  });

  const macros = useMemo(
    () => [
      {
        id: "need_info",
        label: "طلب معلومات",
        internal: false,
        body:
          "شكرًا لتواصلك. حتى نحل المشكلة بسرعة، نحتاج:\n- رقم الجوال\n- وقت حدوث المشكلة\n- لقطة شاشة (إن وجدت)\n- هل المشكلة مستمرة الآن؟",
      },
      {
        id: "ack_investigating",
        label: "تم الاستلام",
        internal: false,
        body: "تم استلام طلبك، ونحن الآن نتحقق من السبب. سنوافيك بتحديث قريبًا.",
      },
      {
        id: "resolved_confirm",
        label: "تأكيد الحل",
        internal: false,
        body: "تم تطبيق الحل. هل يمكنك تجربة نفس الخطوات الآن وتأكيد أن المشكلة انتهت؟",
      },
      {
        id: "internal_triage",
        label: "ملاحظة داخلية (Triaging)",
        internal: true,
        body: "Triaging: تحديد السبب المحتمل + جمع الأدلة + تحديد الإجراء التالي.\n- تأثير: \n- أولوية: \n- خطوة تالية: ",
      },
    ],
    [],
  );

  const suggestedSteps = useMemo(() => {
    const steps: Array<{ title: string; hint: string }> = [];
    if (!ticket) return steps;
    if (String(ticket.priority || "").toLowerCase() === "critical") {
      steps.push({ title: "تصعيد فورًا", hint: "ارفع الأولوية واطلب سبب التصعيد لتوثيق القرار." });
    }
    steps.push({ title: "إسناد التذكرة", hint: "إسنادها لنفسك أو لوكيل محدد لتجنب ضياعها." });
    steps.push({ title: "جمع معلومات", hint: "اطلب رقم الجوال + وقت حدوث المشكلة + لقطة شاشة." });
    steps.push({ title: "تحقق من سياق العيادة", hint: "راجع الدفع/الصحة/التذاكر السابقة لتحديد السبب بسرعة." });
    return steps;
  }, [ticket]);

  async function assignToMe() {
    const meRes = await fetch("/api/auth/me", { cache: "no-store" });
    const me = (await meRes.json().catch(() => null)) as { ok?: boolean; user_id?: string } | null;
    const myId = Number(me?.user_id || 0);
    if (!myId) throw new Error("لا يمكن تحديد المستخدم الحالي.");
    const ok = await action.run(async (signal) => {
      const res = await fetch("/api/ops/support/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId, assigned_to: myId }),
        signal,
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر إسناد التذكرة."));
      return true;
    });
    if (ok) {
      await ticketsQ.refetch();
      router.refresh();
    }
  }

  async function escalate() {
    const prompt = await safety.askReason({
      title: "تصعيد التذكرة",
      description: "سيتم تصعيد التذكرة ورفع الأولوية إلى حرج.",
      reasonPlaceholder: "سبب التصعيد (اختياري)",
      minReasonLen: 0,
      riskLevel: "high",
      confirmLabel: "تصعيد",
    });
    if (!prompt.ok) return;
    const ok = await action.run(async (signal) => {
      const res = await fetch("/api/ops/support/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId, reason: prompt.reason.trim() || undefined }),
        signal,
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر تصعيد التذكرة."));
      return true;
    });
    if (ok) {
      await ticketsQ.refetch();
      await messagesQ.refetch();
    }
  }

  async function setStatus(status: "open" | "assigned" | "escalated" | "resolved") {
    const prompt = await safety.askReason({
      title: "تحديث حالة التذكرة",
      description: `تغيير الحالة إلى: ${status}`,
      reasonPlaceholder: "سبب التحديث (اختياري)",
      minReasonLen: 0,
      riskLevel: status === "resolved" ? "medium" : "medium",
      confirmLabel: "تحديث",
    });
    if (!prompt.ok) return;
    const ok = await action.run(async (signal) => {
      const res = await fetch("/api/ops/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId, status, clinic_id: ticket?.clinic_id || 0 }),
        signal,
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر تحديث الحالة."));
      return true;
    });
    if (ok) await ticketsQ.refetch();
  }

  async function sendMessage() {
    if (!body.trim()) return;
    const ok = await action.run(async (signal) => {
      const res = await fetch("/api/ops/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId, body: body.trim(), is_internal_note: internalNote }),
        signal,
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(String(json?.error || "تعذر إرسال الرسالة."));
      return true;
    });
    if (ok) {
      setBody("");
      setInternalNote(false);
      await messagesQ.refetch();
      await ticketsQ.refetch();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">الدعم ← تذكرة</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            #{ticketId} <span className="text-sm text-muted-foreground">{ticket?.subject ? `— ${ticket.subject}` : ""}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ticket?.status ? <Badge variant="secondary">{ticket.status}</Badge> : null}
          {ticket?.priority ? <Badge variant="outline">{ticket.priority}</Badge> : null}
          <Button asChild variant="outline">
            <Link href="/support-agent">العودة للطابور</Link>
          </Button>
        </div>
      </header>

      {ticketsQ.isLoading ? <TableSkeleton rows={6} /> : null}
      {ticketsQ.isError ? (
        <ErrorState title="تعذر تحميل التذكرة" description={ticketsQ.error instanceof Error ? ticketsQ.error.message : "خطأ غير معروف"} onRetry={() => void ticketsQ.refetch()} />
      ) : null}

      {ticket ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <TableToolbar
            title="معلومات"
            subtitle={`العيادة: ${ticket.clinic_name ? `${ticket.clinic_name} (#${ticket.clinic_id})` : `#${ticket.clinic_id ?? "?"}`}`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={action.busy} onClick={() => void assignToMe()}>
              إسناد لي
            </Button>
            <Button size="sm" variant="outline" disabled={action.busy} onClick={() => void escalate()}>
              تصعيد
            </Button>
            <Button size="sm" variant="outline" disabled={action.busy} onClick={() => void setStatus("resolved")}>
              وضعها محلولة
            </Button>
            {ticket.clinic_id ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/platform/clinics/${ticket.clinic_id}?tab=support`}>فتح مركز العيادة</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {ticket?.clinic_id ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">سياق العيادة</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">لمساعدة موظف الدعم بدون فتح صفحات كثيرة.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void clinicSummaryQ.refetch()} disabled={clinicSummaryQ.isFetching}>
              تحديث
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {clinicSummaryQ.isLoading ? <TableSkeleton rows={4} /> : null}
            {clinicSummaryQ.isError ? (
              <ErrorState
                title="تعذر تحميل سياق العيادة"
                description={clinicSummaryQ.error instanceof Error ? clinicSummaryQ.error.message : "خطأ غير معروف"}
                onRetry={() => void clinicSummaryQ.refetch()}
              />
            ) : null}
            {clinicSummaryQ.data ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                  <p className="text-xs text-muted-foreground">الدفع</p>
                  <p className="font-semibold">
                    {String((clinicSummaryQ.data.billing as any)?.clinic?.status || (clinicSummaryQ.data.billing as any)?.status || "غير معروف")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    قفل الدفع: {String(Boolean((clinicSummaryQ.data.billing as any)?.clinic?.billing_locked ?? (clinicSummaryQ.data.billing as any)?.billing_locked))}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                  <p className="text-xs text-muted-foreground">الصحة</p>
                  <p className="font-semibold">DB OK: {String(Boolean((clinicSummaryQ.data.health as any)?.db_ok))}</p>
                  <p className="text-xs text-muted-foreground">latency: {String((clinicSummaryQ.data.health as any)?.db_latency_ms ?? "—")} ms</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                  <p className="text-xs text-muted-foreground">التذاكر</p>
                  <p className="font-semibold">
                    مفتوحة: {String((clinicSummaryQ.data.tickets as any)?.analytics?.open_tickets ?? (clinicSummaryQ.data.tickets as any)?.open_tickets ?? "—")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    إجمالي: {String((clinicSummaryQ.data.tickets as any)?.analytics?.total_tickets ?? (clinicSummaryQ.data.tickets as any)?.total_tickets ?? "—")}
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {ticket ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">خطوات مقترحة</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">مسار مبسط لموظف الدعم للوصول للحل بسرعة.</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {suggestedSteps.map((s) => (
              <div key={s.title} className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
                <p className="font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">ردود جاهزة (Macros)</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">اختر ردًا جاهزًا وسيتم وضعه في صندوق الكتابة.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {macros.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant="outline"
              onClick={() => {
                setBody(m.body);
                setMacroNote(Boolean(m.internal));
                setInternalNote(Boolean(m.internal));
              }}
            >
              {m.label}
            </Button>
          ))}
          {macroNote ? <Badge variant="warning">سيتم إرسالها كملاحظة داخلية</Badge> : <Badge variant="secondary">سيتم إرسالها للعميل</Badge>}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-border bg-card p-4">
        <TableToolbar title="الرسائل" subtitle="محادثة التذكرة" />
        {messagesQ.isLoading ? <TableSkeleton rows={10} /> : null}
        {messagesQ.isError ? (
          <ErrorState title="تعذر تحميل الرسائل" description={messagesQ.error instanceof Error ? messagesQ.error.message : "خطأ غير معروف"} onRetry={() => void messagesQ.refetch()} />
        ) : null}
        <div className="mt-3 space-y-2 text-sm">
          {(messagesQ.data ?? []).length === 0 ? <p className="text-muted-foreground">لا توجد رسائل.</p> : null}
          {(messagesQ.data ?? []).map((m) => (
            <div key={m.id} className="rounded-xl border border-border/60 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {m.is_internal_note ? "ملاحظة داخلية" : "رسالة"} • {m.sender_role} • {new Date(m.created_at).toLocaleString("ar")}
                </p>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="اكتب ردًا أو ملاحظة..." />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant={internalNote ? "default" : "outline"} onClick={() => setInternalNote((v) => !v)}>
              {internalNote ? "ملاحظة داخلية: نعم" : "ملاحظة داخلية: لا"}
            </Button>
            <Button size="sm" onClick={() => void sendMessage()} disabled={action.busy || !body.trim()}>
              إرسال
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

