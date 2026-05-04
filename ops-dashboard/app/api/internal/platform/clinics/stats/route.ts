import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assertSchedulingServiceToken } from "@/lib/internalAuth";
import { requirePlatformPerm } from "@/lib/platform/platformPerms";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = assertSchedulingServiceToken(req);
  if (denied) return denied;
  const platformScope = req.headers.get("x-platform-scope") === "true";
  if (!platformScope) return NextResponse.json({ ok: false, error: "platform_scope_required" }, { status: 403 });

  const perm = await requirePlatformPerm(req, "clinic.read");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const pool = getPool();
  const r = await pool.query(
    `SELECT
        c.id::bigint AS clinic_id,
        COUNT(su.id)::int AS users_count,
        COUNT(st.id) FILTER (WHERE st.status IN ('open','assigned','escalated'))::int AS open_tickets_count,
        MAX(st.created_at) AS last_ticket_at
     FROM clinics c
     LEFT JOIN staff_users su
       ON su.clinic_id = c.id
      AND su.deleted_at IS NULL
     LEFT JOIN support_tickets st
       ON st.clinic_id = c.id
     WHERE c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.id ASC`,
  );

  return NextResponse.json({ ok: true, clinics: r.rows });
}

