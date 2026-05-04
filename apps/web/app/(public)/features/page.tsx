import type { Metadata } from "next";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "المميزات | كلينك ساس",
  description: "استكشف مميزات واتساب الذكي، الحجز متعدد الأطباء، التقارير، الفوترة، الأمان، وصلاحيات الفريق.",
};

const items = [
  ["أتمتة واتساب", "إدارة الرسائل والردود والمتابعة من صندوق موحد."],
  ["موظف استقبال ذكي", "ردود سياقية على مدار الساعة مع تحكم كامل."],
  ["جدولة متعددة الأطباء", "جدولة متقدمة لأكثر من طبيب مع أولوية المواعيد."],
  ["التقارير", "مؤشرات أداء يومية وأسبوعية للتحويل والردود والحجوزات."],
  ["الفوترة", "تسعير واضح وإدارة اشتراك لكل عيادة."],
  ["صلاحيات الفريق", "صلاحيات دقيقة للإدارة والسكرتارية والطبيب."],
  ["الأمان", "تصميم آمن مع عزل البيانات وممارسات سحابية حديثة."],
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-bold">المميزات</h1>
      <p className="max-w-3xl text-muted-foreground">
        منصة متكاملة مصممة للعيادات الحديثة التي تريد تحويل واتساب إلى قناة تشغيل ونمو فعالة.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([title, desc]) => (
          <Card key={title} className="p-6">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-muted-foreground">{desc}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
