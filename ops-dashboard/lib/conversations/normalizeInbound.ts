export type NormalizedInboundRules = {
  from: string;
  to: string;
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
}): NormalizedInboundRules {
  const clinicIdRaw = String(input.clinic_id ?? "1").trim();
  const clinic_id = Number.parseInt(clinicIdRaw.replace(/[^0-9]/g, ""), 10) || 1;
  const workflowStartedAt = Date.now();
  const from = String(input.from ?? input.sender ?? "").trim();
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
