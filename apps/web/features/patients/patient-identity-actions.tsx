"use client";

import Link from "next/link";
import { Copy, CalendarPlus, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("تم النسخ.");
  } catch {
    toast.error("تعذر النسخ.");
  }
}

export function PatientIdentityActions({
  patientId,
  waDigits,
  chatId,
  lastConversationId,
}: {
  patientId: number;
  waDigits: string | null;
  chatId: string;
  lastConversationId: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-cg-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!waDigits}
        onClick={() => void copyToClipboard(waDigits || "")}
        title={waDigits ? "نسخ رقم واتساب" : "لا يوجد رقم واتساب"}
      >
        <Copy className="h-4 w-4" />
        نسخ الرقم
      </Button>
      <Button variant="outline" size="sm" onClick={() => void copyToClipboard(chatId)} title="نسخ معرّف واتساب">
        <Copy className="h-4 w-4" />
        نسخ المعرّف
      </Button>

      {lastConversationId ? (
        <Button size="sm" asChild>
          <Link href={`/inbox/${lastConversationId}`}>
            <MessageSquareText className="h-4 w-4" />
            فتح المحادثة
          </Link>
        </Button>
      ) : (
        <Button size="sm" disabled title="لا توجد محادثة محفوظة لهذا المريض بعد">
          <MessageSquareText className="h-4 w-4" />
          فتح المحادثة
        </Button>
      )}

      <Button variant="outline" size="sm" asChild>
        <Link href={`/appointments?patient_id=${encodeURIComponent(String(patientId))}`}>
          <CalendarPlus className="h-4 w-4" />
          إنشاء موعد
        </Link>
      </Button>
    </div>
  );
}

