import { DoctorBoard } from "./DoctorBoard";

export const dynamic = "force-dynamic";

export default function DoctorPage() {
  return (
    <main>
      <h1 className="mb-2 text-xl font-semibold text-white">لوحة الطبيب — الدور</h1>
      <p className="mb-6 text-sm text-slate-400">قائمة اليوم، تسجيل وصول، إنهاء، أو تخطي.</p>
      <DoctorBoard />
    </main>
  );
}
