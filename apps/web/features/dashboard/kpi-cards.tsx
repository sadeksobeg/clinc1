import Link from "next/link";
import { Bot, CalendarCheck, Clock3, MessageCircleWarning, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCompactNumber } from "@/lib/format";

type Kpi = {
  totalPatients: number | null;
  todayAppointments: number | null;
  aiSavedHours: number | null;
  pendingReplies: number | null;
  activeDoctors: number | null;
};

const itemConfig = [
  { key: "totalPatients", label: "إجمالي المرضى", icon: Users, format: (v: number) => formatCompactNumber(v) },
  { key: "todayAppointments", label: "مواعيد اليوم", icon: CalendarCheck, format: (v: number) => v.toString() },
  { key: "aiSavedHours", label: "ساعات موفرة بالذكاء", icon: Clock3, format: (v: number) => `${v} س` },
  { key: "pendingReplies", label: "الردود المعلقة", icon: MessageCircleWarning, format: (v: number) => v.toString() },
  { key: "activeDoctors", label: "الأطباء النشطون", icon: Bot, format: (v: number) => v.toString() },
] as const;

export function KpiCards({ metrics }: { metrics: Kpi }) {
  return (
    <div className="grid gap-cg-4 sm:grid-cols-2 xl:grid-cols-3">
      {itemConfig.map((item) => (
        <Link
          key={item.key}
          href={
            item.key === "totalPatients"
              ? "/patients"
              : item.key === "todayAppointments"
                ? "/appointments"
                : item.key === "pendingReplies"
                  ? "/inbox"
                  : item.key === "activeDoctors"
                    ? "/doctors"
                    : "/analytics"
          }
          className="group"
        >
          <Card className="glass-card">
            <CardContent className="flex items-center justify-between p-cg-5">
              <div className="min-w-0 flex-1">
                <p className="text-ds-body text-muted-foreground">{item.label}</p>
                {metrics[item.key] == null ? (
                  <p className="mt-cg-2 text-ds-h1 font-semibold">—</p>
                ) : (
                  <p className="mt-cg-2 text-ds-h1 font-semibold">{item.format(metrics[item.key] as number)}</p>
                )}
                <p className={cn("mt-cg-1 text-ds-small text-muted-foreground", metrics[item.key] != null ? "group-hover:text-foreground" : "")}>
                  {metrics[item.key] == null ? "البيانات غير متاحة حالياً" : "اضغط لعرض التفاصيل"}
                </p>
              </div>
              <div className="grid h-10 w-10 place-content-center rounded-xl bg-primary/10 text-primary transition-transform duration-ds-normal ease-ds-out group-hover:scale-105">
                <item.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
