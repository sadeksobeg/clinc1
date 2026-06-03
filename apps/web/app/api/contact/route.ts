import { NextResponse } from "next/server";
import { z } from "zod";
import { deliverContactMessage } from "@/lib/contact-mail";

const schema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  message: z.string().trim().min(10),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    const result = await deliverContactMessage(parsed.data);
    if (result.status === "not_configured") {
      console.error("[lead.contact] SMTP/webhook not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS in .env.prod");
      return NextResponse.json({ ok: false, error: "mail_not_configured" }, { status: 503 });
    }
    if (result.status === "send_failed") {
      console.error("[lead.contact] SMTP configured but delivery failed — check SMTP_PASS and Hostinger mailbox");
      return NextResponse.json({ ok: false, error: "mail_send_failed" }, { status: 502 });
    }

    console.info("[lead.contact]", JSON.stringify({ ...parsed.data, created_at: new Date().toISOString() }));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[lead.contact] send failed", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
