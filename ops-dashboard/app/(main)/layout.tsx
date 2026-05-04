import { OpsNav } from "@/components/OpsNav";
import { getPool } from "@/lib/db";
import { isDemoModePublic } from "@/lib/demoMode";
import { getBillingSnapshot } from "@/lib/billing/localBilling";
import { getSession } from "@/lib/session";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const email = typeof session?.email === "string" ? session.email : undefined;
  const role = typeof session?.role === "string" ? session.role : undefined;
  const clinicId = Number(session?.clinicId ?? 0);
  const billing = clinicId > 0 ? await getBillingSnapshot(getPool(), clinicId) : null;
  const demo = isDemoModePublic();
  return (
    <div className="min-h-screen">
      {demo ? (
        <div className="border-b border-amber-800/60 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100">
          وضع العرض التوضيحي — بعض الإجراءات الحساسة (مثل إزاحة الموعد عند خروج الطبيب) تُحاكى فقط ولن تُعدّل
          الإنتاج.
        </div>
      ) : null}
      {billing && (billing.status === "trial" || billing.status === "trial_expiring") ? (
        <div
          className={`border-b px-4 py-2 text-center text-xs ${
            billing.status === "trial_expiring"
              ? "border-amber-800/60 bg-amber-950/70 text-amber-100"
              : "border-emerald-800/60 bg-emerald-950/70 text-emerald-100"
          }`}
        >
          {billing.status === "trial_expiring"
            ? `تنبيه: التجربة تنتهي قريبًا (${billing.trial_days_left} يوم). افتح الفوترة لتجنب التوقف.`
            : `لديك فترة تجريبية متبقية: ${billing.trial_days_left} يوم`}
        </div>
      ) : null}
      <OpsNav email={email} role={role} />
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
