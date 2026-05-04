import { NextResponse } from "next/server";
import { z } from "zod";
import { callOpsApi, requireUserSession } from "@/lib/secure-api";

const bodySchema = z.object({
  mode: z.enum(["single", "emergency_mode"]),
  enabled: z.boolean(),
  reason: z.string().min(5).max(500),
  flag_key: z.enum(["whatsapp_send_disabled", "ai_autoreply_disabled", "auto_booking_disabled", "emergency_global_disable"]).optional(),
  clinic_id: z.number().int().positive().optional(),
});

const allowedRoles = new Set(["admin", "owner", "ops_admin", "ops_manager", "super_admin"]);

export async function POST(req: Request) {
  const session = await requireUserSession(req);
  if (session instanceof NextResponse) return session;
  const role = String(session.role || "").toLowerCase();
  if (!allowedRoles.has(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const upstream = await callOpsApi(req, "/api/internal/system/emergency/toggle", {
    method: "POST",
    bodyObject: parsed.data,
  });
  const json = await upstream.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(json, { status: upstream.status });
}

