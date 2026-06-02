import type { Metadata } from "next";
import { brandTitle } from "@/lib/brand";
import { TrialSignupWizard } from "@/features/public/forms/trial-signup-wizard";

export const metadata: Metadata = {
  title: brandTitle("تجربة مجانية 3 أيام"),
  description: "أنشئ تجربة مجانية لعيادتك خلال دقائق بدون بطاقة دفع.",
};

export default function TrialPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-bold">ابدأ التجربة المجانية</h1>
      <p className="text-muted-foreground">رحلة إعداد سريعة من 4 خطوات لتحويل واتساب إلى قناة تشغيل كاملة.</p>
      <TrialSignupWizard />
    </div>
  );
}
