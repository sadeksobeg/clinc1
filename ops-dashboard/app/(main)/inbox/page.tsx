import { InboxList } from "./InboxList";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const showTour = sp?.tour === "1";
  return (
    <main>
      {showTour ? (
        <div className="mb-4 rounded-xl border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">
          جولة سريعة: ابدأ من أول محادثة، راجع المقترحات، ثم نفّذ الحجز من الإجراءات.
        </div>
      ) : null}
      <h1 className="mb-4 text-xl font-semibold text-white">المحادثات المفتوحة</h1>
      <p className="mb-6 text-sm text-slate-400">يتم التحديث تلقائياً كل بضع ثوانٍ.</p>
      <InboxList showTour={showTour} />
    </main>
  );
}
