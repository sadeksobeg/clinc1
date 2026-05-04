"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDayKey } from "@/lib/format";

type Ticket = {
  id: number;
  subject: string;
  status: "open" | "assigned" | "escalated" | "resolved";
  priority: "low" | "normal" | "high" | "critical";
  support_sla_deadline?: string | null;
  support_first_response_due_at?: string | null;
  support_breach_flag?: boolean;
  support_priority_score?: number;
  sla?: { breached: boolean; late_response: boolean };
};

type Message = {
  id: number;
  body: string;
  is_internal_note: boolean;
  created_at: string;
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<{
    breach_rate?: number;
    first_response_seconds_avg?: number;
    resolution_seconds_avg?: number;
    workload?: Array<{ agent_id: number; open_tickets: number }>;
  }>({});

  const selected = useMemo(() => tickets.find((t) => t.id === selectedTicketId) || null, [tickets, selectedTicketId]);

  async function loadTickets() {
    setIsLoading(true);
    setError(null);
    try {
      const [ticketsRes, analyticsRes] = await Promise.all([
        fetch("/api/ops/support/tickets", { cache: "no-store" }),
        fetch("/api/ops/support/analytics", { cache: "no-store" }),
      ]);
      const j = (await ticketsRes.json().catch(() => ({}))) as { tickets?: Ticket[] };
      setTickets(j.tickets ?? []);
      if (!selectedTicketId && j.tickets?.length) setSelectedTicketId(j.tickets[0].id);
      const a = (await analyticsRes.json().catch(() => ({}))) as { analytics?: typeof analytics };
      setAnalytics(a.analytics ?? {});
    } catch {
      setError("تعذر تحميل بيانات الدعم حاليًا. تأكد من جاهزية الخدمات ثم أعد المحاولة.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMessages(ticketId: number) {
    setIsLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/ops/support/messages?ticket_id=${ticketId}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { messages?: Message[] };
      setMessages(j.messages ?? []);
    } catch {
      setError("تعذر تحميل رسائل التذكرة.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, []);

  useEffect(() => {
    if (!selectedTicketId) return;
    void loadMessages(selectedTicketId);
  }, [selectedTicketId]);

  async function createTicket() {
    if (!subject.trim() || !text.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await fetch("/api/ops/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: text.trim(), priority: "normal" }),
      });
      setSubject("");
      setText("");
      await loadTickets();
    } catch {
      setError("تعذر فتح تذكرة جديدة.");
    } finally {
      setIsLoading(false);
    }
  }

  async function sendMessage() {
    if (!selectedTicketId || !text.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await fetch("/api/ops/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selectedTicketId, body: text.trim() }),
      });
      setText("");
      await loadMessages(selectedTicketId);
    } catch {
      setError("تعذر إرسال الرسالة.");
    } finally {
      setIsLoading(false);
    }
  }

  async function setStatus(status: Ticket["status"]) {
    if (!selectedTicketId) return;
    setIsLoading(true);
    setError(null);
    try {
      await fetch("/api/ops/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selectedTicketId, status }),
      });
      await loadTickets();
    } catch {
      setError("تعذر تحديث حالة التذكرة.");
    } finally {
      setIsLoading(false);
    }
  }

  async function escalate() {
    if (!selectedTicketId || !reason.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await fetch("/api/ops/support/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: selectedTicketId, reason: reason.trim() }),
      });
      setReason("");
      await loadTickets();
    } catch {
      setError("تعذر تصعيد التذكرة.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-cg-5">
      <header>
        <p className="text-ds-body text-muted-foreground">مركز عمليات الدعم — مرتبط بالتذاكر والرسائل الفعلية</p>
        <h1 className="text-ds-h1 font-semibold tracking-tight">الدعم</h1>
        {error ? (
          <div className="mt-cg-3 rounded-xl border border-danger/30 bg-danger/10 px-cg-3 py-cg-2 text-ds-body text-danger">{error}</div>
        ) : null}
        <div className="mt-cg-3 grid gap-cg-2 text-ds-small md:grid-cols-3">
          <div className="rounded border px-cg-2 py-cg-1">نسبة خرق SLA: {Number((analytics.breach_rate || 0) * 100).toFixed(2)}%</div>
          <div className="rounded border px-cg-2 py-cg-1">متوسط أول رد: {Math.round(Number(analytics.first_response_seconds_avg || 0) / 60)} دقيقة</div>
          <div className="rounded border px-cg-2 py-cg-1">متوسط الحل: {Math.round(Number(analytics.resolution_seconds_avg || 0) / 60)} دقيقة</div>
        </div>
      </header>

      <div className="grid gap-cg-4 lg:grid-cols-3">
        <section className="rounded-xl border p-cg-3 lg:col-span-1">
          <div className="mb-cg-3 flex items-center justify-between">
            <h2 className="font-medium">التذاكر</h2>
            <Button variant="outline" size="sm" onClick={() => void loadTickets()} disabled={isLoading}>
              تحديث
            </Button>
          </div>
          <div className="flex flex-col gap-cg-2">
            {tickets.length === 0 ? (
              <div className="rounded-lg border p-cg-3 text-ds-body text-muted-foreground">لا توجد تذاكر حالياً.</div>
            ) : null}
            {tickets.map((t) => (
              <button
                key={t.id}
                className={`w-full rounded-lg border p-cg-2 text-start text-ds-body ${selectedTicketId === t.id ? "bg-muted" : ""}`}
                onClick={() => setSelectedTicketId(t.id)}
              >
                <div className="font-medium">#{t.id} - {t.subject}</div>
                <div className="text-ds-small text-muted-foreground">
                  الحالة: {t.status} | الأولوية: {t.priority} | النقاط: {Number(t.support_priority_score || 0)} | خرق: {String(Boolean(t.support_breach_flag))}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-cg-3 rounded-xl border p-cg-3 lg:col-span-2">
          <h2 className="font-medium">المحادثة والإجراءات</h2>
          <div className="flex flex-wrap gap-cg-2">
            <Button variant="outline" onClick={() => void setStatus("assigned")} disabled={!selected || isLoading}>إسناد</Button>
            <Button variant="outline" onClick={() => void setStatus("resolved")} disabled={!selected || isLoading}>إغلاق</Button>
            <Button
              variant="outline"
              onClick={() =>
                void fetch("/api/ops/support/sla/recompute", { method: "POST" }).then(() => loadTickets())
              }
              disabled={isLoading}
            >
              إعادة حساب SLA
            </Button>
          </div>
          <div className="max-h-80 flex flex-col gap-cg-2 overflow-auto rounded-lg border p-cg-2">
            {selected && messages.length === 0 ? (
              <div className="rounded-md border p-cg-2 text-ds-body text-muted-foreground">لا توجد رسائل لهذه التذكرة بعد.</div>
            ) : null}
            {messages.map((m) => (
              <div key={m.id} className="rounded-md border p-cg-2 text-ds-body">
                <p>{m.body}</p>
                <p className="text-ds-small text-muted-foreground">{formatDayKey(m.created_at)} • {new Date(m.created_at).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={selected ? "اكتب ردك…" : "اكتب وصف المشكلة…"}
          />
          {selected ? (
            <Button onClick={() => void sendMessage()} disabled={isLoading || !text.trim()}>
              إرسال الرد
            </Button>
          ) : (
            <Button onClick={() => void createTicket()} disabled={isLoading || !subject.trim() || !text.trim()}>
              فتح تذكرة
            </Button>
          )}

          <div className="grid gap-cg-2 rounded-xl border p-cg-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب التصعيد (إلزامي)" />
            </div>
            <Button variant="outline" onClick={() => void escalate()} disabled={!selected || isLoading || !reason.trim()}>
              تصعيد
            </Button>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-cg-2 rounded-xl border p-cg-3">
        <h2 className="font-medium">تذكرة جديدة</h2>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="عنوان التذكرة" />
        <Button onClick={() => void createTicket()} disabled={isLoading || !subject.trim() || !text.trim()}>
          فتح
        </Button>
      </section>
    </div>
  );
}
