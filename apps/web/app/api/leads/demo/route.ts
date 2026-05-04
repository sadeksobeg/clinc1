import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  clinicName: z.string().min(2),
  size: z.string().min(1),
  need: z.string().min(5),
  preferredTime: z.string().min(2),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }
    console.info("[lead.demo]", JSON.stringify({ ...parsed.data, created_at: new Date().toISOString() }));
    return NextResponse.json({ ok: true, message: "سيتم التواصل خلال 24 ساعة" }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
