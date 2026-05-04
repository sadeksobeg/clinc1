import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/secure-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  const otp = (process.env.NEXT_PUBLIC_SUPERADMIN_DEV_OTP || "").trim();
  return NextResponse.json({ ok: true, enabled: Boolean(otp), otp });
}

