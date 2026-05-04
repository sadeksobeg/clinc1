import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  otp_code: z.string().trim().length(6).optional(),
});

function opsBaseUrl(): string {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "");
  if (!u) throw new Error("OPS_DASHBOARD_URL is not set");
  return u;
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const upstream = await fetch(`${opsBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) {
    return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 502 });
  }
  const data = (await upstream.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    otp_required?: boolean;
  };
  if (data.otp_required) {
    return NextResponse.json({ ok: true, otp_required: true });
  }
  if (!upstream.ok || !data.ok) {
    return NextResponse.json({ ok: false, error: data.error || "invalid_credentials" }, { status: upstream.status || 401 });
  }

  const setCookie = upstream.headers.get("set-cookie") || "";
  const m = /ops_session=([^;]+)/.exec(setCookie);
  if (!m?.[1]) {
    return NextResponse.json({ ok: false, error: "missing_session_cookie" }, { status: 502 });
  }
  const token = m[1];

  const res = NextResponse.json({ ok: true });
  res.cookies.set("ops_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
