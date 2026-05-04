"use client";

import Link from "next/link";
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatArabicDate, formatPatientContactLine } from "@/lib/format";
import { statusLabel } from "@/lib/i18n/status";
import type { PatientRow } from "@/lib/ops-server";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";

const helper = createColumnHelper<PatientRow>();

export function PatientsTable({ rows }: { rows: PatientRow[] }) {
  const [search, setSearch] = useState("");

  const columns = useMemo(
    () => [
      helper.accessor((row) => row.display_name ?? row.chat_id, {
        id: "name",
        header: "الاسم",
        cell: (info) => {
          const row = info.row.original;
          return (
            <Link href={`/patients/${row.id}`} className="font-medium text-primary hover:underline">
              {info.getValue() as string}
            </Link>
          );
        },
      }),
      helper.accessor((row) => formatPatientContactLine(row.phone_e164, row.chat_id), {
        id: "wa_digits",
        header: "رقم واتساب",
        cell: (info) => (info.getValue() as string) || "—",
      }),
      helper.accessor("chat_id", { header: "المعرف", cell: (info) => String(info.getValue() || "—").slice(0, 28) }),
      helper.accessor("last_seen_at", {
        header: "آخر ظهور",
        cell: (info) => formatArabicDate(String(info.getValue())),
      }),
      helper.accessor("status", {
        header: "الحالة",
        cell: (info) => (
          <Badge variant={info.getValue() === "active" ? "success" : "outline"}>{statusLabel(String(info.getValue()))}</Badge>
        ),
      }),
      helper.display({
        id: "flags",
        header: "ملاحظات",
        cell: ({ row }) => {
          const r = row.original;
          if (r.is_blacklisted) return <Badge variant="danger">قائمة حظر</Badge>;
          if (r.is_vip) return <Badge variant="secondary">VIP</Badge>;
          return <span className="text-muted-foreground">—</span>;
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const activePatient = table.getRowModel().rows[0]?.original;
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="grid gap-cg-5 xl:grid-cols-[1fr_320px]">
      <WorkspacePanel
        title="قائمة المرضى"
        subtitle={rows.length ? `${filteredCount} من ${rows.length}` : "لا توجد بيانات"}
        contentClassName="p-cg-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-cg-3 border-b border-border/80 p-cg-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم المريض أو رقم الهاتف..."
            className="max-w-sm"
          />
          {search.trim() ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setSearch("")}>
              مسح البحث
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-ds-body">
            <thead className="bg-muted/50">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id} className="px-cg-4 py-cg-3 text-start font-medium text-muted-foreground">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-cg-4 py-cg-7 text-center text-ds-body text-muted-foreground">
                    {rows.length === 0 ? "لا يوجد مرضى بعد." : "لا توجد نتائج مطابقة لهذا البحث."}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60 hover:bg-muted/30">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-cg-4 py-cg-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/80 p-cg-4">
          <p className="text-ds-small text-muted-foreground">
            الصفحة {table.getState().pagination.pageIndex + 1} من {Math.max(1, table.getPageCount())}
          </p>
          <div className="flex gap-cg-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              السابق
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              التالي
            </Button>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel title="بطاقة المريض السريعة" subtitle="لمحة بدون فتح الملف" className="h-fit" contentClassName="p-cg-4">
        {activePatient ? (
          <div className="flex flex-col gap-cg-3 text-ds-body">
            <div className="rounded-xl bg-muted/50 p-cg-3">
              <p className="text-ds-small text-muted-foreground">المريض</p>
              <p className="font-medium">{activePatient.display_name ?? activePatient.chat_id}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-cg-3">
              <p className="text-ds-small text-muted-foreground">آخر ظهور</p>
              <p>{formatArabicDate(activePatient.last_seen_at)}</p>
            </div>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href={`/patients/${activePatient.id}`}>فتح الملف الكامل</Link>
            </Button>
          </div>
        ) : (
          <p className="text-ds-body text-muted-foreground">لا يوجد مريض في القائمة.</p>
        )}
      </WorkspacePanel>
    </div>
  );
}
