"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearLog, exportLogJson, readLog } from "@/lib/clinic-brain/logging";

export function OpsLogExport() {
  const [tick, setTick] = useState(0);
  const stats = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    tick;
    const list = readLog();
    return { total: list.length };
  }, [tick]);

  function handleDownload() {
    try {
      const json = exportLogJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clinic-ops-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير سجل العمليات.");
    } catch {
      toast.error("تعذر تصدير السجل.");
    }
  }

  function handleClear() {
    clearLog();
    setTick((n) => n + 1);
    toast.message("تم مسح سجل العمليات المحلي.");
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-cg-3">
      <p className="text-ds-small font-semibold">سجل العمليات المحلي</p>
      <p className="mt-cg-1 text-ds-label text-muted-foreground">
        يُحتفظ بآخر 200 حدث تشغيلي على الجهاز فقط (لأغراض التشخيص). العدد الحالي: {stats.total}
      </p>
      <div className="mt-cg-2 flex flex-wrap gap-cg-2">
        <Button type="button" size="sm" variant="outline" onClick={handleDownload}>
          تصدير JSON
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handleClear}>
          مسح السجل
        </Button>
      </div>
    </div>
  );
}
