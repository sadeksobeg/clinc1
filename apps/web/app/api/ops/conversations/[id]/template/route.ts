import { NextResponse } from "next/server";
import { proxyConversationReply } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

const templateMap: Record<string, string> = {
  welcome: "اهلا بك! يسعدنا خدمتك. هل تفضلين/تفضل موعدًا صباحيًا أم مسائيًا؟",
  ask_name: "من فضلك شاركنا الاسم الكامل لتأكيد الحجز.",
  ask_doctor: "من الطبيب الذي تفضله؟ يمكننا ترشيح الطبيب الأنسب حسب التخصص.",
  ask_time: "ما الوقت المناسب لك؟ لدينا خيارات اليوم وغدًا.",
  closed_hours: "العيادة مغلقة الآن. نستقبلك فور بدء الدوام الرسمي.",
};

type Ctx = { params: { id: string } };

export async function GET(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({
    ok: true,
    templates: Object.entries(templateMap).map(([key, text]) => ({ key, text })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  const conversationId = Number(ctx.params.id);
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const key = typeof (body as { template_key?: unknown }).template_key === "string" ? (body as { template_key: string }).template_key : "";
  const idempotencyKey =
    typeof (body as { idempotency_key?: unknown }).idempotency_key === "string"
      ? (body as { idempotency_key: string }).idempotency_key
      : undefined;
  const text = templateMap[key];
  if (!text) return NextResponse.json({ ok: false, error: "unknown_template_key" }, { status: 400 });

  const res = await proxyConversationReply(conversationId, {
    clinic_id: user.clinic_id,
    text,
    template_key: key,
    idempotency_key: idempotencyKey,
  });
  const json = await res.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: res.status });
}
