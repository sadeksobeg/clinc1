import { NextResponse } from "next/server";
import { z } from "zod";
import { createTrialSignup } from "@/lib/ops-server";

const bodySchema = z.object({
  clinicName: z.string().min(2),
  ownerName: z.string().min(2),
  whatsapp: z.string().min(8),
  city: z.string().min(2),
  specialty: z.string().min(2),
  doctorsCount: z.coerce.number().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
  browserFingerprint: z.string().min(6).max(300).optional(),
  vat: z.string().min(3).max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }
    const data = parsed.data;
    if (data.password !== data.confirmPassword) {
      return NextResponse.json({ ok: false, error: "password_mismatch" }, { status: 400 });
    }

    const trialDays = 3;
    const emailDomain = data.email.includes("@") ? data.email.split("@").pop() : undefined;
    const result = await createTrialSignup({
      clinicName: data.clinicName,
      ownerName: data.ownerName,
      whatsapp: data.whatsapp,
      city: data.city,
      specialty: data.specialty,
      doctorsCount: data.doctorsCount,
      email: data.email,
      password: data.password,
      trialDays,
      browserFingerprint: data.browserFingerprint,
      domain: emailDomain,
      vat: data.vat,
    });
    if (!result.ok || !result.trial) {
      const status =
        typeof result.status === "number"
          ? result.status
          : result.error === "trial_identity_blocked" || result.error === "review_required"
            ? 409
            : 502;
      return NextResponse.json({ ok: false, error: result.error || "trial_signup_failed" }, { status });
    }
    return NextResponse.json(
      {
        ok: true,
        trial: {
          clinic_id: result.trial.clinic_id,
          clinic_slug: result.trial.clinic_slug,
          expires_at: result.trial.trial_ends_at,
          doctors_limit: result.trial.doctors_limit,
          billing_plan: 120,
          extra_doctors: Math.max(0, result.trial.doctors_limit - 1),
          direct_access_url: result.trial.direct_access_url,
        },
        warnings: result.warnings ?? {},
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
