import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  message: z.string().min(10),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }
    console.info("[lead.contact]", JSON.stringify({ ...parsed.data, created_at: new Date().toISOString() }));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
