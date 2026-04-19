import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { crmUpsertInbound } from "@/lib/crm/inboundIngest";
import { opsLogError } from "@/lib/opsLog";

const bodySchema = z.object({
  clinic_id: z.number().int().positive(),
  from: z.string().min(1).max(512),
  text: z.string().max(16000).default(""),
  messageId: z.string().max(512).optional().default(""),
  dedupeHash: z.string().min(1).max(256),
  ruleIntent: z.string().max(64),
  rulePriority: z.number().int().min(1).max(10),
  ruleHandoff: z.boolean(),
  fallbackReply: z.string().max(8000),
  outsideHours: z.boolean(),
  receivedAt: z.string().max(64),
  alertTo: z.string().max(512),
  workflowStartedAt: z.number().optional(),
});

/**
 * Replaces n8n "CRM Upsert Inbound" raw SQL with parameterized server-side logic.
 * Auth: same Bearer SCHEDULING_SERVICE_TOKEN as other internal scheduling routes.
 */
export async function POST(req: Request) {
  const auth = assertSchedulingServiceToken(req);
  if (auth) return auth;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const pool = getPool();
    const row = await crmUpsertInbound(pool, parsed.data);
    return NextResponse.json(row);
  } catch (e) {
    opsLogError("internal/crm/inbound-ingest", e, {});
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
