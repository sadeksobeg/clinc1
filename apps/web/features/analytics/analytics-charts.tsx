"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AnalyticsDayRow = { name: string; appointments: number };

export function AnalyticsCharts({ dayRows, aiPercent }: { dayRows: AnalyticsDayRow[]; aiPercent: number | null }) {
  return (
    <div className="grid gap-cg-5 xl:grid-cols-2">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">عدد المواعيد حسب اليوم</CardTitle>
          <p className="text-ds-small text-muted-foreground">مُجمَّع من مواعيدك القادمة في النطاق المحدد.</p>
        </CardHeader>
        <CardContent className="h-72">
          {dayRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-ds-body text-muted-foreground">لا توجد مواعيد لعرضها.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dayRows}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="appointments" stroke="hsl(var(--primary))" strokeWidth={3} name="مواعيد" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">المواعيد حسب اليوم (أعمدة)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {dayRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-ds-body text-muted-foreground">لا توجد مواعيد لعرضها.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayRows}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="appointments" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} name="مواعيد" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-ds-h3 font-semibold">مؤشر المنتج: نسبة الرد الآلي</CardTitle>
          <p className="text-ds-small text-muted-foreground">من مؤشرات المنتج (ليست دقة نموذج لكل رسالة).</p>
        </CardHeader>
        <CardContent className="flex min-h-[140px] flex-col justify-center gap-cg-2 py-cg-5">
          {aiPercent == null ? (
            <>
              <p className="text-ds-h1 font-semibold tabular-nums">—</p>
              <p className="text-ds-body text-muted-foreground">البيانات غير متاحة حالياً.</p>
            </>
          ) : (
            <>
              <p className="text-ds-h1 font-semibold tabular-nums">{aiPercent}%</p>
              <p className="text-ds-body text-muted-foreground">حصة الرسائل التي عالجها الذكاء الاصطناعي من إجمالي الوارد في الفترة المُجمَّعة في الخادم.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
