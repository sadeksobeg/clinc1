import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { callOpsApi } from "@/lib/secure-api";
import { requirePlatformPerm } from "@/lib/requirePlatformPerm";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    clinic_id: z.number().int().positive(),
    title: z.string().min(3).max(200).optional(),
  })
  .strict();

export async function POST(req: Request) {
  // This endpoint is a convenience to create a minimal end-to-end dataset
  // so the platform pages are not empty in fresh environments.
  const a = await requirePlatformPerm(req, "incidents.write");
  if (a instanceof NextResponse) return a;
  const b = await requirePlatformPerm(req, "decision.write");
  if (b instanceof NextResponse) return b;
  const c = await requirePlatformPerm(req, "action.create");
  if (c instanceof NextResponse) return c;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail("invalid_json", "Invalid JSON"), { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(fail("invalid_body", "Invalid body", parsed.error.flatten()), { status: 400 });

  const clinicId = parsed.data.clinic_id;
  const incidentTitle = parsed.data.title || "حالة اختبار: مشكلة واتساب";

  const incidentRes = await callOpsApi(req, "/api/internal/platform/incidents", {
    method: "POST",
    bodyObject: {
      clinic_id: clinicId,
      title: incidentTitle,
      description: "تم إنشاء هذا السجل لتفعيل صفحات المنصة في بيئة جديدة.",
      severity: "warning",
      metadata: { bootstrap: true },
    },
  });
  const incidentJson = (await incidentRes.json().catch(() => null)) as any;
  if (!incidentRes.ok || !incidentJson || incidentJson.ok !== true) {
    return NextResponse.json(
      fail(String(incidentJson?.error || "upstream_error"), "Failed to create incident", { status: incidentRes.status, upstream: incidentJson }),
      { status: incidentRes.ok ? 400 : incidentRes.status },
    );
  }
  const incidentId = Number(incidentJson.incident?.id || 0);

  const decisionRes = await callOpsApi(req, "/api/internal/platform/decisions", {
    method: "POST",
    bodyObject: {
      clinic_id: clinicId,
      incident_id: incidentId || undefined,
      decision_type: "manual.bootstrap_review",
      trigger_source: "bootstrap",
      context: { bootstrap: true, incident_title: incidentTitle },
    },
  });
  const decisionJson = (await decisionRes.json().catch(() => null)) as any;
  if (!decisionRes.ok || !decisionJson || decisionJson.ok !== true) {
    return NextResponse.json(
      fail(String(decisionJson?.error || "upstream_error"), "Failed to create decision", { status: decisionRes.status, upstream: decisionJson }),
      { status: decisionRes.ok ? 400 : decisionRes.status },
    );
  }
  const decisionId = Number(decisionJson.decision_id || 0);

  const actionRes = await callOpsApi(req, "/api/internal/platform/actions", {
    method: "POST",
    bodyObject: {
      action_type: "incident.ack",
      target_type: "platform_incident",
      target_id: incidentId || undefined,
      clinic_id: clinicId,
      incident_id: incidentId || undefined,
      decision_id: decisionId || undefined,
      payload: { bootstrap: true },
      idempotency_key: crypto.randomUUID(),
    },
  });
  const actionJson = (await actionRes.json().catch(() => null)) as any;
  if (!actionRes.ok || !actionJson || actionJson.ok !== true) {
    return NextResponse.json(
      fail(String(actionJson?.error || "upstream_error"), "Failed to create action", { status: actionRes.status, upstream: actionJson }),
      { status: actionRes.ok ? 400 : actionRes.status },
    );
  }

  return NextResponse.json(
    ok({
      clinic_id: clinicId,
      incident_id: incidentId,
      decision_id: decisionId,
      action_id: Number(actionJson.action_id || 0),
    }),
    { status: 201 },
  );
}

