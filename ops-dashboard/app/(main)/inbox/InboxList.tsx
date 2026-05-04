"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = {
  conversation_id: string;
  state: string;
  status: string;
  patient_id: string;
  chat_id: string;
  display_name: string | null;
  is_vip: boolean;
  is_blacklisted: boolean;
  last_message: string | null;
  last_message_at: string | null;
};

export function InboxList({ showTour = false }: { showTour?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tourEnabled, setTourEnabled] = useState(showTour);

  useEffect(() => {
    if (!showTour) {
      setTourEnabled(false);
      return;
    }
    try {
      const done = window.localStorage.getItem("ops_inbox_tour_done_v1") === "1";
      setTourEnabled(!done);
    } catch {
      setTourEnabled(showTour);
    }
  }, [showTour]);

  async function load() {
    try {
      const r = await fetch("/api/inbox", { cache: "no-store", credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "load failed");
      setRows(j.rows || []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    }
  }

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 8000);
    return () => clearInterval(id);
  }, []);

  if (err) {
    return <p className="text-red-400">{err}</p>;
  }

  if (!rows.length) {
    return (
      <div className="space-y-2">
        {tourEnabled ? (
          <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3 text-sm text-emerald-100">
            الخطوة 1 من 3: عند وصول أول رسالة ستظهر هنا. افتح أول محادثة للمتابعة في الجولة.
          </div>
        ) : null}
        <p className="text-slate-500">لا توجد محادثات مفتوحة حالياً.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tourEnabled ? (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3 text-sm text-emerald-100">
          <p className="font-medium">الخطوة 1 من 3: افتح أول محادثة</p>
          <p className="mt-1 text-emerald-200/90">سننتقل بعدها مباشرة إلى خطوة الإجراءات والرد داخل المحادثة.</p>
          <Link
            href={`/inbox/${rows[0].conversation_id}?tour=1&step=2`}
            className="mt-2 inline-block rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
          >
            فتح أول محادثة الآن
          </Link>
        </div>
      ) : null}
      <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.conversation_id}>
          <Link
            href={tourEnabled ? `/inbox/${row.conversation_id}?tour=1&step=2` : `/inbox/${row.conversation_id}`}
            className="block rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-700/60"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-white">{row.display_name || row.chat_id}</span>
              <span className="text-xs text-slate-500">{row.state}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {row.is_vip ? (
                <span className="rounded bg-amber-900/50 px-1.5 text-amber-200">VIP</span>
              ) : null}
              {row.is_blacklisted ? (
                <span className="rounded bg-red-900/40 px-1.5 text-red-200">محظور</span>
              ) : null}
            </div>
            {row.last_message ? (
              <p className="mt-2 line-clamp-2 text-sm text-slate-400">{row.last_message}</p>
            ) : null}
          </Link>
        </li>
      ))}
      </ul>
    </div>
  );
}
