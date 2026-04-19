import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

export function OpsNav({ email, role }: { email?: string; role?: string }) {
  const sec = role === "secretary" || role === "admin";
  const doc = role === "doctor" || role === "admin";
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/inbox" className="font-semibold text-emerald-400">
            صندوق الوارد
          </Link>
          <Link href="/analytics" className="text-slate-300 hover:text-white">
            تحليلات
          </Link>
          {sec ? (
            <Link href="/secretary" className="text-slate-300 hover:text-white">
              السكرتيرة
            </Link>
          ) : null}
          {doc ? (
            <Link href="/doctor" className="text-slate-300 hover:text-white">
              الطبيب
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {email ? <span>{email}</span> : null}
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
