"use client";

import { Bot, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConversationDetail } from "@/types/ops";
import type { InboxRow } from "@/lib/ops-server";

type DecisionSnapshot = {
  type?: string;
  reason?: string;
  confidence?: number;
  primary_medical_reason?: string;
  patient_context?: Record<string, unknown>;
};

export function InboxAiPanel({
  thread,
  detail,
  suggestedReply,
  onApplySuggestion,
  onConfirmBooking,
  timelineItems,
}: {
  thread: InboxRow | undefined;
  detail: ConversationDetail | undefined;
  suggestedReply: string;
  onApplySuggestion: () => void;
  onConfirmBooking?: () => void;
  timelineItems: Array<{ id: string; title: string; tone: string }>;
}) {
  const lastDecision = (detail?.routing?.last_decision ?? null) as DecisionSnapshot | null;
  const confidencePct = Math.round(
    Math.max(0, Math.min(1, Number(lastDecision?.confidence ?? thread?.last_inbound_confidence ?? 0))) * 100,
  );
  const intentLabel =
    thread?.last_inbound_intent ??
    (lastDecision?.type ? String(lastDecision.type) : null) ??
    "غير محدد";
  const handoff = String(thread?.state || "").toUpperCase() === "PENDING_HANDOFF";

  const entities: Array<{ label: string; value: string }> = [];
  if (lastDecision?.primary_medical_reason) {
    entities.push({ label: "سبب طبي", value: String(lastDecision.primary_medical_reason) });
  }
  if (lastDecision?.reason) entities.push({ label: "ملاحظة", value: String(lastDecision.reason) });
  const ctx = lastDecision?.patient_context as Record<string, unknown> | undefined;
  if (ctx?.name) entities.push({ label: "المريض", value: String(ctx.name) });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/50 px-cg-3 py-cg-3">
        <div className="flex items-center gap-cg-2">
          <Sparkles className="h-4 w-4 ai-panel-accent" />
          <h2 className="text-[13px] font-semibold">تحليل الذكاء الاصطناعي</h2>
        </div>
        {handoff ? (
          <Badge variant="warning" className="mt-cg-2 w-fit">
            يحتاج تدخل بشري
          </Badge>
        ) : null}
        {thread?.handoff_reason ? (
          <p className="mt-cg-1 text-[11px] text-muted-foreground">{thread.handoff_reason}</p>
        ) : null}
      </div>

      <div className="flex-1 space-y-cg-4 overflow-auto p-cg-3">
        <div className="rounded-lg ai-panel-border ai-panel-bg p-cg-3">
          <p className="text-[11px] text-muted-foreground">نية المريض</p>
          <Badge variant="outline" className="mt-cg-1 ai-panel-border">
            {intentLabel}
          </Badge>
        </div>

        <div>
          <div className="mb-cg-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">ثقة الموديل</span>
            <span className="font-semibold ai-panel-accent">{confidencePct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[hsl(var(--ai-accent))] transition-all"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>

        {entities.length > 0 ? (
          <div className="space-y-cg-2">
            <p className="text-[11px] font-medium text-muted-foreground">كيانات مستخرجة</p>
            {entities.map((e) => (
              <div key={e.label} className="rounded-lg border border-border/50 bg-muted/30 px-cg-2 py-cg-1.5 text-[12px]">
                <span className="text-muted-foreground">{e.label}: </span>
                <span className="font-medium">{e.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {suggestedReply ? (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-cg-3">
            <p className="mb-cg-1 flex items-center gap-cg-1 text-[11px] font-medium text-primary">
              <Bot className="h-3.5 w-3.5" />
              اقتراح الرد
            </p>
            <p className="text-[12px] leading-relaxed text-foreground">{suggestedReply}</p>
            <Button type="button" size="sm" variant="brand" className="mt-cg-2 h-8 w-full text-[12px]" onClick={onApplySuggestion}>
              استخدام الاقتراح
            </Button>
          </div>
        ) : null}

        {onConfirmBooking ? (
          <Button type="button" size="sm" variant="outline" className="h-8 w-full text-[12px]" onClick={onConfirmBooking}>
            تأكيد الحجز
          </Button>
        ) : null}

        {timelineItems.length > 0 ? (
          <div>
            <p className="mb-cg-2 text-[11px] font-medium text-muted-foreground">مسار المحادثة</p>
            <ul className="space-y-cg-2 border-s-2 border-primary/20 ps-cg-3">
              {timelineItems.slice(0, 6).map((item) => (
                <li key={item.id} className="text-[11px]">
                  <span className="font-medium">{item.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
