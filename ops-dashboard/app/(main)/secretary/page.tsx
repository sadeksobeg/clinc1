import { SecretaryBoard } from "./SecretaryBoard";

export const dynamic = "force-dynamic";

export default function SecretaryPage() {
  return (
    <main>
      <h1 className="mb-2 text-xl font-semibold text-white">لوحة السكرتيرة — حجوزات اليوم</h1>
      <p className="mb-6 text-sm text-slate-400">القائمة، الحجز اليدوي، وإشعار خروج الطبيب.</p>
      <SecretaryBoard />
    </main>
  );
}
