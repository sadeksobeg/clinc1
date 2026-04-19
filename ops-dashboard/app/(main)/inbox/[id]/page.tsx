import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ConversationActions } from "./ConversationActions";
import { ReplyForm } from "./ReplyForm";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.clinicId) redirect("/login");

  const convId = Number(params.id);
  if (!Number.isFinite(convId)) notFound();

  const clinicId = Number(session.clinicId);
  const pool = getPool();
  const conv = await pool.query(
    `SELECT c.id, c.state, c.status, c.opened_at,
            p.id AS patient_id, p.chat_id, p.display_name, p.notes, p.is_vip, p.is_blacklisted
     FROM conversations c
     JOIN patients p ON p.id = c.patient_id
     WHERE c.id = $1 AND c.clinic_id = $2 AND c.deleted_at IS NULL`,
    [convId, clinicId],
  );
  const c = conv.rows[0] as
    | {
        id: number;
        state: string;
        status: string;
        opened_at: string;
        patient_id: number;
        chat_id: string;
        display_name: string | null;
        notes: string | null;
        is_vip: boolean;
        is_blacklisted: boolean;
      }
    | undefined;
  if (!c) notFound();

  const msgs = await pool.query(
    `SELECT id, direction, text, created_at, source
     FROM messages
     WHERE conversation_id = $1 AND clinic_id = $2
     ORDER BY created_at ASC
     LIMIT 500`,
    [convId, clinicId],
  );

  const canAct = session.role !== "viewer";

  return (
    <main>
      <Link href="/inbox" className="mb-4 inline-block text-sm text-emerald-400 hover:underline">
        ← العودة للقائمة
      </Link>
      <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <h1 className="text-lg font-semibold text-white">{c.display_name || c.chat_id}</h1>
        <p className="text-xs text-slate-500">{c.chat_id}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
          <span>الحالة: {c.state}</span>
          <span>المحادثة: {c.status}</span>
        </div>
        {c.notes ? (
          <p className="mt-3 border-t border-slate-800 pt-3 text-sm text-slate-300">ملاحظات: {c.notes}</p>
        ) : null}
      </div>

      {canAct ? <ConversationActions conversationId={String(c.id)} initialStatus={c.status} /> : null}

      <section className="space-y-3">
        {msgs.rows.map((m: { id: number; direction: string; text: string; created_at: string; source: string }) => (
          <article
            key={m.id}
            className={`rounded-lg border p-3 text-sm ${
              m.direction === "inbound"
                ? "border-slate-700 bg-slate-900/40"
                : "border-emerald-900/40 bg-emerald-950/20"
            }`}
          >
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{m.direction === "inbound" ? "وارد" : "صادر"}</span>
              <span>{new Date(m.created_at).toLocaleString("ar-JO")}</span>
            </div>
            <p className="whitespace-pre-wrap text-slate-100">{m.text}</p>
            <p className="mt-1 text-[10px] text-slate-600">{m.source}</p>
          </article>
        ))}
      </section>

      {canAct ? (
        <ReplyForm conversationId={String(c.id)} />
      ) : (
        <p className="mt-6 text-sm text-slate-500">صلاحية العرض فقط — لا يمكن الإرسال.</p>
      )}
    </main>
  );
}
