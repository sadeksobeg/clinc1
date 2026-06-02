"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useSafetyDialog } from "@/components/platform/SafetyDialogProvider";
import type { ApiResponse } from "@/lib/api-response";

const ACTION_TYPES = [
  { value: "clinic.suspend", label: "تعليق العيادة (مرتفع)" },
  { value: "clinic.activate", label: "تفعيل العيادة (متوسط)" },
  { value: "incident.ack", label: "إقرار حادثة (منخفض)" },
  { value: "incident.resolve", label: "حل حادثة (متوسط)" },
  { value: "system.toggle_runtime_flag", label: "تبديل حالة خدمة/علم (حرج)" },
];

export default function PlatformCreateActionPage() {
  const action = useAsyncAction();
  const safety = useSafetyDialog();
  const [actionType, setActionType] = useState<string>(ACTION_TYPES[0]?.value || "clinic.suspend");
  const [clinicId, setClinicId] = useState<string>("");
  const [incidentId, setIncidentId] = useState<string>("");
  const [targetType, setTargetType] = useState<string>("manual");
  const [targetId, setTargetId] = useState<string>("");
  const [payload, setPayload] = useState<string>("{}");

  const idempotencyKey = useMemo(() => {
    const base = `manual:${actionType}:${clinicId || "global"}:${incidentId || "none"}:${Date.now()}`;
    return base.slice(0, 120);
  }, [actionType, clinicId, incidentId]);

  return (
    <div className="flex flex-col gap-cg-5">
      <PlatformPageHeader title="إنشاء إجراء" right={<Badge variant="secondary">يدوي</Badge>} />

      <Card className="glass-card">
        <CardHeader className="pb-cg-2">
          <CardTitle className="text-ds-body">طلب إجراء</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-cg-4 text-ds-body">
          <div className="grid gap-cg-3 md:grid-cols-2">
            <div className="flex flex-col gap-cg-2">
              <p className="text-ds-small text-muted-foreground">نوع الإجراء</p>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر نوع الإجراء" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-cg-2">
              <p className="text-ds-small text-muted-foreground">نوع الهدف</p>
              <Input value={targetType} onChange={(e) => setTargetType(e.target.value)} placeholder="manual | clinic | incident | system" />
            </div>
            <div className="flex flex-col gap-cg-2">
              <p className="text-ds-small text-muted-foreground">رقم العيادة (اختياري)</p>
              <Input value={clinicId} onChange={(e) => setClinicId(e.target.value)} placeholder="مثال: 12" />
            </div>
            <div className="flex flex-col gap-cg-2">
              <p className="text-ds-small text-muted-foreground">رقم الحادثة (اختياري)</p>
              <Input value={incidentId} onChange={(e) => setIncidentId(e.target.value)} placeholder="مثال: 55" />
            </div>
            <div className="flex flex-col gap-cg-2">
              <p className="text-ds-small text-muted-foreground">رقم الهدف (اختياري)</p>
              <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="مثال: 55" />
            </div>
            <div className="flex flex-col gap-cg-2">
              <p className="text-ds-small text-muted-foreground">مفتاح التكرار (Idempotency)</p>
              <Input value={idempotencyKey} readOnly />
            </div>
          </div>

          <div className="flex flex-col gap-cg-2">
            <p className="text-ds-small text-muted-foreground">البيانات (JSON)</p>
            <Textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={6} />
          </div>

          <div className="flex flex-wrap gap-cg-2">
            <Button
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  async (signal) => {
                    const prompt = await safety.askReason({
                      title: "إنشاء إجراء",
                      description: "سيتم إنشاء إجراء جديد في سجل الإجراءات.",
                      reasonPlaceholder: "سبب الإنشاء (مطلوب)",
                      minReasonLen: 5,
                      riskLevel: "high",
                      confirmLabel: "إنشاء",
                    });
                    if (!prompt.ok) return null;
                    const reason = prompt.reason.trim();

                    let payloadObj: Record<string, unknown>;
                    try {
                      const raw = payload.trim() ? JSON.parse(payload) : {};
                      payloadObj = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
                    } catch {
                      throw new Error("JSON غير صالح.");
                    }

                    const res = await fetch("/api/platform/actions", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action_type: actionType,
                        target_type: targetType,
                        target_id: targetId ? Number(targetId) : undefined,
                        clinic_id: clinicId ? Number(clinicId) : undefined,
                        incident_id: incidentId ? Number(incidentId) : undefined,
                        payload: { ...payloadObj, reason },
                        idempotency_key: idempotencyKey,
                      }),
                      signal,
                    });
                    const out = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
                    if (!res.ok || !out || out.ok !== true) throw new Error(out && out.ok === false ? out.error.message : "تعذر إنشاء الإجراء.");
                    return out.data;
                  },
                  { successToast: "تم إنشاء الإجراء" },
                )
              }
            >
              إنشاء
            </Button>
            <Button asChild variant="outline">
              <Link href="/platform/actions">العودة للإجراءات</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

