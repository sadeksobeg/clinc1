import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { extractWhatsAppDigits, formatArabicDate } from "@/lib/format";
import { statusLabel } from "@/lib/i18n/status";
import { fetchPatientDetail } from "@/lib/ops-server";
import { getServerClinicIdOrThrow } from "@/lib/serverSession";
import { PatientIdentityActions } from "@/features/patients/patient-identity-actions";

export default async function PatientProfilePage({ params }: { params: { id: string } }) {
  const clinicId = await getServerClinicIdOrThrow();
  const id = Number(params.id);
  if (!Number.isFinite(id) || id < 1) notFound();

  const result = await fetchPatientDetail(id, clinicId).catch(() => ({ ok: false as const }));
  if (!result.ok || !result.patient) notFound();

  const p = result.patient;
  const appts = result.appointments ?? [];
  const notes = [p.notes, p.insurance_note].filter(Boolean).join("\n\n") || null;
  const waDigits = extractWhatsAppDigits(p.chat_id);
  const lastConversationId = typeof p.last_conversation_id === "number" ? p.last_conversation_id : null;

  return (
    <div className="flex flex-col gap-cg-6">
      <PageHeader
        title={p.display_name ?? p.chat_id}
        subtitle={
          <>
            <Link href="/patients" className="text-muted-foreground hover:text-foreground">
              المرضى
            </Link>
            {" · معلومات · زيارات · محادثات"}
          </>
        }
        right={
          <PatientIdentityActions patientId={id} waDigits={waDigits} chatId={p.chat_id} lastConversationId={lastConversationId} />
        }
      />

      <div className="grid gap-cg-5 lg:grid-cols-2">
        <section className="glass-card rounded-2xl border border-border/80 p-cg-5">
          <h2 className="mb-cg-4 text-ds-h2 font-semibold">البيانات الأساسية</h2>
          <dl className="flex flex-col gap-cg-3 text-ds-body">
            <div>
              <dt className="text-ds-small text-muted-foreground">رقم واتساب</dt>
              <dd className="font-medium">{waDigits ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ds-small text-muted-foreground">واتساب</dt>
              <dd className="font-mono text-ds-small break-all">{p.chat_id}</dd>
            </div>
            {p.phone_e164 && String(p.phone_e164).trim() && p.phone_e164 !== waDigits ? (
              <div>
                <dt className="text-ds-small text-muted-foreground">هاتف (إن وُجد)</dt>
                <dd className="font-medium">{p.phone_e164}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-ds-small text-muted-foreground">الحالة</dt>
              <dd>
                <Badge variant={p.status === "active" ? "success" : "outline"}>{statusLabel(p.status)}</Badge>
              </dd>
            </div>
            <div className="flex flex-wrap gap-cg-2">
              {p.is_blacklisted ? <Badge variant="danger">قائمة حظر</Badge> : null}
              {p.is_vip ? <Badge variant="secondary">VIP</Badge> : null}
            </div>
            <div>
              <dt className="text-ds-small text-muted-foreground">أول ظهور</dt>
              <dd>{formatArabicDate(p.first_seen_at)}</dd>
            </div>
            <div>
              <dt className="text-ds-small text-muted-foreground">آخر ظهور</dt>
              <dd>{formatArabicDate(p.last_seen_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="glass-card rounded-2xl border border-border/80 p-cg-5">
          <h2 className="mb-cg-4 text-ds-h2 font-semibold">ملاحظات</h2>
          <p className="whitespace-pre-wrap text-ds-body text-muted-foreground">{notes ?? "—"}</p>
        </section>
      </div>

      <section className="glass-card rounded-2xl border border-border/80 p-cg-5">
        <h2 className="mb-cg-4 text-ds-h2 font-semibold">آخر المواعيد</h2>
        {appts.length === 0 ? (
          <p className="text-ds-body text-muted-foreground">لا توجد مواعيد مسجّلة لهذا المريض.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-ds-body">
            {appts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-cg-2 py-cg-3">
                <div>
                  <p className="font-medium">{formatArabicDate(a.starts_at)}</p>
                  <p className="text-ds-small text-muted-foreground">
                    {statusLabel(a.status)}
                    {a.source_channel ? ` · ${a.source_channel}` : ""}
                  </p>
                </div>
                {a.source_channel === "whatsapp_emergency" ? <Badge variant="danger">طوارئ</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
