import { NextResponse } from "next/server";
import { z } from "zod";
import { deliverContactMessage } from "@/lib/contact-mail";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    const status = await deliverContactMessage(parsed.data);
    if (status === "not_configured") {
      console.error("[lead.contact] SMTP/webhook not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS in .env.prod");
      return NextResponse.json({ ok: false, error: "mail_not_configured" }, { status: 503 });
    }

    console.info("[lead.contact]", JSON.stringify({ ...parsed.data, created_at: new Date().toISOString() }));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[lead.contact] send failed", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
