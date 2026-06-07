import type { Pool } from "pg";
import { getLockedClinic } from "@/lib/conversations/clinicRoutingGuard";

export type NormalizedInboundRules = {
  from: string;
  to: string;
  to_number?: string;
  text: string;
  messageId: string;
  receivedAt: string;
  outsideHours: boolean;
  alertTo: string;
  dedupeHash: string;
  ruleIntent: "GENERAL" | "URGENT" | "BOOKING" | "PRICING";
  rulePriority: number;
  ruleHandoff: boolean;
  fallbackReply: string;
  clinic_id: number;
  workflowStartedAt: number;
};

function hashText(input: string): string {
  const source = String(input || "");
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Mirrors `Normalize Input` in `whatsapp-bridge/n8n-workflow-whatsapp-local.json`. */
export function normalizeInboundRules(input: {
  clinic_id?: unknown;
  from?: unknown;
  sender?: unknown;
  text?: unknown;
  messageId?: unknown;
  receivedAt?: unknown;
  to_number?: unknown;
}): NormalizedInboundRules {
  const clinicIdRaw = String(input.clinic_id ?? "1").trim();
  const clinic_id = Number.parseInt(clinicIdRaw.replace(/[^0-9]/g, ""), 10) || 1;
  const workflowStartedAt = Date.now();
  const from = String(input.from ?? input.sender ?? "").trim();
  const to_number = String(input.to_number ?? "").trim() || undefined;
  const text = String(input.text ?? "").trim();
  const messageId = String(input.messageId ?? "");
  const words = text.toLowerCase();

  const bookingKeywords = ["حجز", "موعد", "appointment", "book", "reserve"];
  const pricingKeywords = ["سعر", "كم", "تكلفة", "price", "cost"];
  const emergencyKeywords = ["طوارئ", "نزيف", "ألم شديد", "الم شديد", "urgent", "emergency"];

  const clinicTimezone = "Asia/Amman";
  const startHour = 9;
  const endHour = 21;
  const nowHour = Number(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: clinicTimezone }),
  );
  const outsideHours = nowHour < startHour || nowHour >= endHour;

  const contains = (arr: string[]) => arr.some((k) => words.includes(k));

  let ruleIntent: NormalizedInboundRules["ruleIntent"] = "GENERAL";
  if (contains(emergencyKeywords)) ruleIntent = "URGENT";
  else if (contains(bookingKeywords)) ruleIntent = "BOOKING";
  else if (contains(pricingKeywords)) ruleIntent = "PRICING";

  const priorityMap: Record<string, number> = { URGENT: 1, BOOKING: 2, PRICING: 3, GENERAL: 4 };
  const rulePriority = priorityMap[ruleIntent] || 4;
  const ruleHandoff = ruleIntent === "URGENT";

  let fallbackReply: string;
  if (outsideHours) {
    fallbackReply = pick([
      "وصلتنا رسالتك، الدوام حالياً مغلق. سنعاود الرد عند بدء الدوام بإذن الله.",
      "شكراً لتواصلك، نحن خارج أوقات الدوام الآن وسنرد عليك أول ما يبدأ الدوام.",
    ]);
  } else if (ruleIntent === "URGENT") {
    fallbackReply = pick([
      "تم استلام رسالتك بشكل عاجل. إذا كانت الحالة طارئة جداً يرجى التواصل مباشرة مع الطوارئ، وسيتم تحويل رسالتك للفريق حالاً.",
      "وصلتنا حالتك كأولوية. في حال وجود خطر مباشر يرجى التوجه للطوارئ فوراً، وسنتابع معك بأسرع وقت.",
    ]);
  } else if (ruleIntent === "BOOKING") {
    fallbackReply = pick([
      "أهلاً بك، تم استلام طلب الحجز. أرسل اسم المريض ورقم الهاتف والوقت المناسب وسننسق الموعد.",
      "تم استلام طلب الموعد. من فضلك أرسل الاسم الثلاثي ورقم الهاتف والفترة المناسبة للحجز.",
    ]);
  } else if (ruleIntent === "PRICING") {
    fallbackReply = pick([
      "الأسعار تختلف حسب الحالة، أرسل تفاصيل أكثر وسنوضح التكلفة المناسبة.",
      "حتى نحدد السعر بدقة، يرجى توضيح نوع الحالة أو الخدمة المطلوبة.",
    ]);
  } else {
    fallbackReply = pick([
      "تم استلام رسالتك، وسيقوم فريق العيادة بالرد عليك قريباً.",
      "وصلتنا رسالتك بنجاح، نشكرك على تواصلك وسنرد عليك بأقرب وقت.",
    ]);
  }

  const dedupeHash = hashText([from, messageId, text].join("::"));
  const receivedAt = String(input.receivedAt || new Date().toISOString());

  return {
    from,
    to: from,
    to_number,
    text,
    messageId,
    receivedAt,
    outsideHours,
    alertTo: "9639XXXXXXXXX@c.us",
    dedupeHash,
    ruleIntent,
    rulePriority,
    ruleHandoff,
    fallbackReply,
    clinic_id,
    workflowStartedAt,
  };
}

/**
 * Dynamic clinic_id resolution. Precedence:
 *   1. existing conversation routing.selected_clinic_id for this WA chat
 *   2. whatsapp_inbound_routes.hub_clinic_id matched by normalized to_number
 *   3. caller-supplied clinic_id (rule-based fallback)
 *
 * Returns the resolved clinic_id and the row of the inbound route (for
 * downstream allowed_clinic_ids / welcome_message_ar consumers). When the
 * tables do not exist yet (pre-migration), returns the rule-based clinic_id.
 */
export type InboundRouteContext = {
  clinic_id: number;
  to_number?: string;
  hub_clinic_id?: number;
  allowed_clinic_ids?: number[];
  welcome_message_ar?: string | null;
};

function normalizeToNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length >= 6) return `+${digits}`;
  return trimmed;
}

export async function resolveInboundRouteContext(
  pool: Pool,
  rules: NormalizedInboundRules,
): Promise<InboundRouteContext> {
  const base: InboundRouteContext = { clinic_id: rules.clinic_id, to_number: rules.to_number };
  const toNum = normalizeToNumber(rules.to_number);

  // 1) Reuse existing conversation binding (cheap, common path)
  try {
    const conv = await pool.query(
      `SELECT c.clinic_id, c.routing
         FROM conversations c
         JOIN patients p ON p.id = c.patient_id
        WHERE c.clinic_id = ANY(SELECT id FROM clinics WHERE deleted_at IS NULL)
          AND p.chat_id = $1
        ORDER BY updated_at DESC
        LIMIT 1`,
      [rules.from],
    );
    const row = conv.rows[0] as { clinic_id: number; routing: Record<string, unknown> } | undefined;
    if (row) {
      const locked = getLockedClinic(row.routing || {});
      if (locked != null) {
        return { ...base, clinic_id: locked, hub_clinic_id: Number(row.clinic_id) };
      }
      const sel = (row.routing || {}).selected_clinic_id;
      if (typeof sel === "number" && Number.isFinite(sel)) {
        return { ...base, clinic_id: sel, hub_clinic_id: Number(row.clinic_id) };
      }
    }
  } catch {
    /* table missing or query failed — fall through */
  }

  // 2) Route by the WhatsApp number the bridge is bound to
  if (toNum) {
    try {
      const r = await pool.query(
        `SELECT hub_clinic_id, allowed_clinic_ids, welcome_message_ar
           FROM whatsapp_inbound_routes
          WHERE is_active = TRUE AND to_number = $1
          LIMIT 1`,
        [toNum],
      );
      const row = r.rows[0] as
        | { hub_clinic_id: number; allowed_clinic_ids: number[] | null; welcome_message_ar: string | null }
        | undefined;
      if (row) {
        return {
          ...base,
          clinic_id: Number(row.hub_clinic_id),
          hub_clinic_id: Number(row.hub_clinic_id),
          allowed_clinic_ids: Array.isArray(row.allowed_clinic_ids) ? row.allowed_clinic_ids.map(Number) : [],
          welcome_message_ar: row.welcome_message_ar,
        };
      }
    } catch {
      /* table missing — pre-migration */
    }
  }

  // 3) Rule-based fallback (legacy)
  return base;
}
