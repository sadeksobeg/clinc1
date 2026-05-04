import { InboxWorkspace } from "@/features/inbox/inbox-workspace";
import { fetchConversationDetail, fetchInboxRows } from "@/lib/ops-server";
import { getServerClinicIdOrThrow } from "@/lib/serverSession";
import type { ConversationDetail, ConversationMessage } from "@/types/ops";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function InboxPage() {
  const clinicId = await getServerClinicIdOrThrow();
  const listResult = await fetchInboxRows(clinicId).catch(() => ({ ok: false as const, rows: [], error: "تعذر تحميل المحادثات" }));
  const rows = listResult.ok ? (listResult.rows ?? []) : [];
  const selectedId = rows[0]?.conversation_id;

  let detail: ConversationDetail | undefined;
  let messages: ConversationMessage[] = [];
  if (selectedId) {
    const detailResult = await fetchConversationDetail(selectedId, clinicId).catch(() => ({ ok: false as const }));
    if (detailResult.ok) {
      detail = detailResult.conversation as ConversationDetail;
      messages = (detailResult.messages ?? []) as ConversationMessage[];
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-cg-4">
      <div className="shrink-0">
        <PageHeader title="مركز إدارة المحادثات" subtitle="مساحة إدارة محادثات احترافية" />
      </div>
      <div className="min-h-0 flex-1">
        <InboxWorkspace rows={rows} selectedId={selectedId} detail={detail} messages={messages} />
      </div>
    </div>
  );
}
