import Link from "next/link";
import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getBillingSnapshot } from "@/lib/billing/localBilling";

export default async function BillingPage() {
  const session = await getSession();
  if (!session?.sub) redirect("/login");
  const clinicId = Number(session.clinicId ?? 0);
  if (!clinicId) redirect("/login");

  const snap = await getBillingSnapshot(getPool(), clinicId);
  const locked = snap.is_locked;
  const trialExpiring = snap.status === "trial_expiring";
  const trialEnds = snap.trial_ends_at ? new Date(snap.trial_ends_at).toLocaleString("ar-SA") : "غير محدد";

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-2xl font-semibold text-white">إدارة الاشتراك</h1>
        <p className="mt-2 text-sm text-slate-300">
          {locked
            ? "انتهت التجربة أو الاشتراك غير نشط. بياناتك محفوظة بأمان ويمكنك إعادة التفعيل فورًا."
            : trialExpiring
              ? "فترة التجربة تقترب من الانتهاء. فعّل الاشتراك الآن حتى لا تتوقف الأتمتة والردود."
              : "اشتراكك نشط حاليًا. يمكنك الترقية أو التواصل مع المبيعات لأي خطة مخصصة."}
        </p>
        {trialExpiring ? (
          <p className="mt-2 rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            نافذة انتهاء التجربة: أقل من 48 ساعة متبقية.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
          <div className="rounded-lg border border-slate-700 p-3">الحالة: <span className="font-semibold text-white">{snap.status}</span></div>
          <div className="rounded-lg border border-slate-700 p-3">نهاية التجربة: <span className="font-semibold text-white">{trialEnds}</span></div>
          <div className="rounded-lg border border-slate-700 p-3">التكلفة التقديرية: <span className="font-semibold text-white">${snap.estimated_total_usd}</span></div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <PlanCard title="Starter" price="$120" features={["عيادة واحدة", "حتى 1 طبيب ضمن الخطة", "دعم أساسي"]} />
        <PlanCard title="Growth" price="$220" features={["حتى 5 أطباء", "تقارير أوسع", "دعم أسرع"]} featured />
        <PlanCard title="Enterprise" price="مخصص" features={["عدة فروع", "SLA مخصص", "دعم مدير حساب"]} />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-white">الترقية والدفع</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/account" className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500">
            Upgrade now
          </Link>
          <a
            href="https://wa.me/20123456789"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800"
          >
            WhatsApp support
          </a>
          <a href="mailto:sales@midauto.example" className="rounded-md border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800">
            Contact sales
          </a>
        </div>
      </section>
    </main>
  );
}

function PlanCard(props: { title: string; price: string; features: string[]; featured?: boolean }) {
  return (
    <article className={`rounded-2xl border p-4 ${props.featured ? "border-emerald-500 bg-emerald-950/30" : "border-slate-800 bg-slate-900/60"}`}>
      <h3 className="text-lg font-semibold text-white">{props.title}</h3>
      <p className="mt-1 text-sm text-emerald-300">{props.price}</p>
      <ul className="mt-3 space-y-1 text-sm text-slate-300">
        {props.features.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>
    </article>
  );
}
