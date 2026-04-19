import { DateTime } from "luxon";
import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import { interpretInboundText } from "@/lib/scheduling/interpret";
import type { InterpretResult } from "@/lib/scheduling/types";
import { explainNoSlots, findNextSlots } from "@/lib/scheduling/slotService";
import type { NormalizedInboundRules } from "./normalizeInbound";

export type SchedulingDecision = {
  finalIntent: string;
  finalPriority: number;
  finalReply: string;
  handoffRequired: boolean;
  decisionSource: "rules" | "scheduling_interpret" | "scheduling_engine";
  aiValid: boolean;
  aiFailureReason: string;
  schedulingSlots?: unknown[];
};

function rulesDecision(crm: InboundIngestRow, norm: NormalizedInboundRules, reason: string): SchedulingDecision {
  return {
    finalIntent: norm.ruleIntent,
    finalPriority: norm.rulePriority,
    finalReply: norm.fallbackReply,
    handoffRequired: norm.ruleHandoff,
    decisionSource: "rules",
    aiValid: false,
    aiFailureReason: reason,
  };
}

/** Mirrors `Scheduling Engine` n8n code node using in-process APIs (no self-HTTP). */
export async function runSchedulingDecision(
  pool: Pool,
  crm: InboundIngestRow,
  norm: NormalizedInboundRules,
  opts?: { interpret?: InterpretResult },
): Promise<SchedulingDecision> {
  try {
    const int = opts?.interpret ?? (await interpretInboundText(crm.text));
    if (int.intent === "urgent") {
      return {
        finalIntent: "URGENT",
        finalPriority: 1,
        finalReply:
          norm.fallbackReply || "تم استلام حالتك كأولوية. إذا كانت الحالة طارئة جداً يرجى التواصل مع الطوارئ.",
        handoffRequired: true,
        decisionSource: "scheduling_interpret",
        aiValid: false,
        aiFailureReason: "n/a",
      };
    }
    if (int.intent !== "booking") {
      return rulesDecision(crm, norm, "not_booking");
    }

    const slots = await findNextSlots(pool, {
      clinicId: crm.clinic_id,
      specialty: int.specialty || undefined,
      limit: 3,
      conversationId: crm.conversation_id,
    });

    const tzR = await pool.query(`SELECT timezone FROM clinics WHERE id = $1`, [crm.clinic_id]);
    const tz = (tzR.rows[0]?.timezone as string) || "Asia/Amman";
    const reply_lines = slots.map((s, i) => {
      const t = DateTime.fromISO(s.starts_at, { zone: "utc" }).setZone(tz);
      return `${i + 1}) ${s.doctor_name} — ${t.toFormat("yyyy-LL-dd HH:mm")}`;
    });
    let closed_message_ar: string | undefined;
    if (slots.length === 0) {
      const ex = await explainNoSlots(pool, {
        clinicId: crm.clinic_id,
        specialty: int.specialty || undefined,
        conversationId: crm.conversation_id,
      });
      closed_message_ar = ex.closed_message_ar;
    }
    const lines = reply_lines.join("\n");
    const finalReply = lines
      ? `أهلاً بك، أقرب المواعيد المتاحة:\n${lines}\nأرسل رقم الخيار (1، 2، أو 3).`
      : closed_message_ar || norm.fallbackReply;

    return {
      finalIntent: "BOOKING",
      finalPriority: 2,
      finalReply,
      handoffRequired: false,
      decisionSource: "scheduling_engine",
      aiValid: false,
      aiFailureReason: "n/a",
      schedulingSlots: slots,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return rulesDecision(crm, norm, msg);
  }
}
