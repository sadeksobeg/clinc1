import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  /** Allow missing, undefined, or "" on first step; only 6-digit strings count as OTP. */
  otp_code: z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === "") return undefined;
      const s = String(v).trim();
      return s.length ? s : undefined;
    },
    z.string().length(6).optional(),
  ),
});

function opsBaseUrl(): string | null {
  const u = process.env.OPS_DASHBOARD_URL?.replace(/\/$/, "") || "";
  return u || null;
}

/** قراءة ترويسة بلا حساسية لحالة الأحرف (Cloudflare قد يرسل CF-Connecting-IP). */
function headerLine(req: Request, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of req.headers.entries()) {
    if (k.toLowerCase() === want) {
      const s = v?.trim();
      return s || undefined;
    }
  }
  return undefined;
}

/** عنوان الزائر لقائمة IP في ops — يُمرَّر صراحةً إلى ops لأن بعض البروكسيات لا تصل بكل الترويسات. */
function buildForwardHeadersToOps(req: Request): Headers {
  const h = new Headers({ "Content-Type": "application/json" });
  const cf = headerLine(req, "cf-connecting-ip");
  const xffRaw = headerLine(req, "x-forwarded-for");
  const xri = headerLine(req, "x-real-ip");
  const firstXff = xffRaw?.split(",")[0]?.trim();
  const client = cf || firstXff || xri;
  if (client) {
    h.set("cf-connecting-ip", client);
  }
  if (xffRaw) h.set("x-forwarded-for", xffRaw);
  if (xri) h.set("x-real-ip", xri);
  return h;
}

/** Undici may send multiple Set-Cookie; get("set-cookie") is unreliable — use getSetCookie when present. */
function extractOpsSessionToken(upstream: Response): string | null {
  try {
    const headers = upstream.headers;
    const lines: string[] =
      typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
        ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (() => {
            const single = headers.get("set-cookie");
            return single ? [single] : [];
          })();
    for (const line of lines) {
      const m = /ops_session=([^;]+)/.exec(line);
      if (m?.[1]) {
        const raw = m[1].trim();
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const base = opsBaseUrl();
    if (!base) {
      return NextResponse.json(
        { ok: false, error: "auth_misconfigured", detail: "OPS_DASHBOARD_URL is not set on clinic-web" },
        { status: 503 },
      );
    }

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

    const forwardHeaders = buildForwardHeadersToOps(req);

    let upstream: Response | null;
    try {
      upstream = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify(parsed.data),
        cache: "no-store",
      });
    } catch {
      upstream = null;
    }
    if (!upstream) {
      return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 502 });
    }

    const upstreamStatus = upstream.status;
    const data = (await upstream.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      detail?: string;
      otp_required?: boolean;
    };

    if (data.otp_required) {
      return NextResponse.json({ ok: true, otp_required: true });
    }
    if (!upstream.ok || !data.ok) {
      const status = upstreamStatus || 401;
      const fallback = status >= 500 ? "auth_upstream_error" : "invalid_credentials";
      const errMsg = typeof data.error === "string" && data.error.trim() ? data.error.trim() : fallback;
      const payload: Record<string, unknown> = {
        ok: false,
        error: errMsg,
        upstream_http_status: upstreamStatus,
      };
      if (typeof data.detail === "string" && data.detail.trim()) {
        payload.detail = data.detail.trim();
      }
      return NextResponse.json(payload, { status });
    }

    const token = extractOpsSessionToken(upstream);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "missing_session_cookie", upstream_http_status: upstreamStatus },
        { status: 502 },
      );
    }

    try {
      const res = NextResponse.json({ ok: true });
      res.cookies.set("ops_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "cookie_error";
      return NextResponse.json({ ok: false, error: "session_cookie_failed", detail: msg }, { status: 500 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/auth/login]", msg);
    return NextResponse.json({ ok: false, error: "internal_error", detail: msg }, { status: 500 });
  }
}
