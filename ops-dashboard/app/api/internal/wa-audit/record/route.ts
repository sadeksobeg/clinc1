/**
 * POST /api/internal/wa-audit/record
 *
 * Bridge → ops audit sink. Single row per outbound attempt (sent/blocked/retry/failed).
 * Auth: SCHEDULING_SERVICE_TOKEN (same secret the bridge uses for other internal calls).
 *
 * The endpoint is intentionally permissive on shape — bridge metadata may evolve
 * without rolling ops first — so unknown columns are silently dropped.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";

const schema = z
  .object({
    chat_id: z.string().min(1).max(64),
    to_number: z.string().max(64).nullable().optional(),
    clinic_id: z.number().int().positive().nullable().optional(),
    doctor_id: z.number().int().positive().nullable().optional(),
    text_hash: z.string().min(1).max(64),
    text_length: z.number().int().min(0).max(20_000).default(0),
    has_link: z.boolean().default(false),
    send_kind: z.string().max(64).default("patient_reply"),
    provider: z.string().max(64).default("whatsapp_web_js"),
    status: z.enum(["sent", "retry", "failed", "blocked", "dropped"]),
    blocked_reason: z.string().max(200).nullable().optional(),
    latency_ms: z.number().int().min(0).max(600_000).nullable().optional(),
    correlation_id: z.string().max(256).nullable().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const r = parsed.data;
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO wa_send_audit
        (chat_id, to_number, clinic_id, doctor_id, text_hash, text_length, has_link,
         send_kind, provider, status, blocked_reason, latency_ms, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        r.chat_id,
        r.to_number ?? null,
        r.clinic_id ?? null,
        r.doctor_id ?? null,
        r.text_hash,
        r.text_length,
        r.has_link,
        r.send_kind,
        r.provider,
        r.status,
        r.blocked_reason ?? null,
        r.latency_ms ?? null,
        r.correlation_id ?? null,
      ],
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "insert_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
