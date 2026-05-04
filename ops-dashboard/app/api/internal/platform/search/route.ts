import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { writeStructuredLog } from "@/lib/observability/trace";

function qLike(q: string): string {
  return `%${q.replace(/%/g, "").replace(/_/g, "").slice(0, 80)}%`;
}

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || "20")));
  if (q.length < 2) {
    return NextResponse.json({ ok: true, q, results: [] });
  }

  const pool = getPool();
  const actorUserId = Number(req.headers.get("x-user-id") || 0) || null;
  const requestId = req.headers.get("x-request-id")?.trim() || null;
  await writeStructuredLog({
    level: "info",
    eventName: "platform.search.performed",
    requestId,
    clinicId: null,
    userId: actorUserId,
    message: "Platform search executed",
    payload: { q: q.slice(0, 120), limit },
  }).catch(() => undefined);

  const clinics = await pool.query(
    `SELECT id AS clinic_id, name AS clinic_name, slug
     FROM clinics
     WHERE deleted_at IS NULL
       AND (name ILIKE $1 OR slug ILIKE $1)
     ORDER BY name ASC
     LIMIT ${limit}`,
    [qLike(q)],
  );

  const patients = await pool.query(
    `SELECT p.id AS patient_id, p.clinic_id, c.name AS clinic_name, p.display_name, p.phone_e164, p.chat_id, p.last_seen_at
     FROM patients p
     JOIN clinics c ON c.id = p.clinic_id
     WHERE (p.phone_e164 ILIKE $1 OR p.chat_id ILIKE $1 OR COALESCE(p.display_name,'') ILIKE $1)
     ORDER BY p.last_seen_at DESC NULLS LAST
     LIMIT ${limit}`,
    [qLike(q)],
  );

  const conversations = await pool.query(
    `SELECT conv.id AS conversation_id, conv.clinic_id, c.name AS clinic_name, conv.chat_id, conv.status, conv.updated_at
     FROM conversations conv
     JOIN clinics c ON c.id = conv.clinic_id
     WHERE (conv.chat_id ILIKE $1 OR CAST(conv.id AS TEXT) = $2)
     ORDER BY conv.updated_at DESC
     LIMIT ${limit}`,
    [qLike(q), q],
  );

  const paymentRequests = await pool.query(
    `SELECT pr.id AS payment_request_id, pr.clinic_id, c.name AS clinic_name, pr.status, pr.amount_usd, pr.payment_method, pr.requested_at
     FROM clinic_payment_requests pr
     JOIN clinics c ON c.id = pr.clinic_id
     WHERE CAST(pr.id AS TEXT) = $1 OR COALESCE(pr.reference_code,'') ILIKE $2
     ORDER BY pr.requested_at DESC
     LIMIT ${limit}`,
    [q, qLike(q)],
  );

  return NextResponse.json({
    ok: true,
    q,
    results: [
      ...clinics.rows.map((r) => ({ type: "clinic", ...r })),
      ...patients.rows.map((r) => ({ type: "patient", ...r })),
      ...conversations.rows.map((r) => ({ type: "conversation", ...r })),
      ...paymentRequests.rows.map((r) => ({ type: "payment_request", ...r })),
    ],
  });
}

