import { NextResponse } from "next/server";
import { submitDecisionFeedback } from "@/lib/ops-server";
import { requireUserWithClinic } from "@/lib/secure-api";

export async function POST(req: Request) {
  const user = await requireUserWithClinic(req);
  if (user instanceof NextResponse) return user;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const payload = {
    clinic_id: user.clinic_id,
    conversation_id: Number((body as { conversation_id?: number }).conversation_id ?? 0),
    is_correct: Boolean((body as { is_correct?: boolean }).is_correct),
    corrected_decision: (body as { corrected_decision?: "EMERGENCY" | "BOOKING" | "NORMAL" | "UNKNOWN" }).corrected_decision,
    corrected_severity: (body as { corrected_severity?: number }).corrected_severity,
    corrected_medical_signals: (body as {
      corrected_medical_signals?: {
        breathing_issue?: boolean;
        bleeding?: boolean;
        severe_pain?: boolean;
        loss_of_consciousness?: boolean;
        trauma?: boolean;
        infection_signs?: boolean;
        mobility_issue?: boolean;
        psychological_distress?: boolean;
      };
    }).corrected_medical_signals,
    corrected_primary_signal: (body as {
      corrected_primary_signal?:
        | "breathing_issue"
        | "bleeding"
        | "severe_pain"
        | "loss_of_consciousness"
        | "trauma"
        | "infection_signs"
        | "mobility_issue"
        | "psychological_distress";
    }).corrected_primary_signal,
    corrected_patient_context: (body as {
      corrected_patient_context?: { is_child?: boolean; is_elderly?: boolean; chronic_condition?: boolean };
    }).corrected_patient_context,
    note: (body as { note?: string }).note,
    reviewed_by: (body as { reviewed_by?: string }).reviewed_by,
  };

  if (!Number.isFinite(payload.clinic_id) || payload.clinic_id < 1) {
    return NextResponse.json({ ok: false, error: "bad_clinic_id" }, { status: 400 });
  }
  if (!Number.isFinite(payload.conversation_id) || payload.conversation_id < 1) {
    return NextResponse.json({ ok: false, error: "bad_conversation_id" }, { status: 400 });
  }
  if (payload.corrected_severity != null && (!Number.isFinite(payload.corrected_severity) || payload.corrected_severity < 1 || payload.corrected_severity > 5)) {
    return NextResponse.json({ ok: false, error: "bad_corrected_severity" }, { status: 400 });
  }

  const out = await submitDecisionFeedback(payload);
  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
