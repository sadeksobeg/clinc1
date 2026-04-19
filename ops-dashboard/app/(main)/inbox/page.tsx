import { InboxList } from "./InboxList";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold text-white">المحادثات المفتوحة</h1>
      <p className="mb-6 text-sm text-slate-400">يتم التحديث تلقائياً كل بضع ثوانٍ.</p>
      <InboxList />
    </main>
  );
}
