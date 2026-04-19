import { OpsNav } from "@/components/OpsNav";
import { isDemoModePublic } from "@/lib/demoMode";
import { getSession } from "@/lib/session";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const email = typeof session?.email === "string" ? session.email : undefined;
  const role = typeof session?.role === "string" ? session.role : undefined;
  const demo = isDemoModePublic();
  return (
    <div className="min-h-screen">
      {demo ? (
        <div className="border-b border-amber-800/60 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100">
          وضع العرض التوضيحي — بعض الإجراءات الحساسة (مثل إزاحة الموعد عند خروج الطبيب) تُحاكى فقط ولن تُعدّل
          الإنتاج.
        </div>
      ) : null}
      <OpsNav email={email} role={role} />
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
