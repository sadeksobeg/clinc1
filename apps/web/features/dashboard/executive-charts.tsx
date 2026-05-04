"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type TrendPoint = { name: string; appointments: number };

export function ExecutiveCharts({ rows }: { rows: TrendPoint[] }) {
  return (
    <div className="grid gap-cg-5 xl:grid-cols-2">
      <Card className="glass-card xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">اتجاه المواعيد (حسب اليوم)</CardTitle>
          <p className="text-ds-small text-muted-foreground">يُجمَّع من مواعيدك القادمة فقط — لا يشمل إيرادًا أو فوترة.</p>
        </CardHeader>
        <CardContent className="h-72">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-ds-body text-muted-foreground">لا توجد مواعيد في النطاق المعروض.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="appointments" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.18} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
