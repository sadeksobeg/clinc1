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
  let detailError: string | undefined;
  if (selectedId) {
    const detailResult = await fetchConversationDetail(selectedId, clinicId).catch(() => ({
      ok: false as const,
      error: "تعذر تحميل المحادثة",
      status: undefined,
    }));
    if (detailResult.ok) {
      detail = detailResult.conversation as ConversationDetail;
      messages = (detailResult.messages ?? []) as ConversationMessage[];
    } else {
      detailError =
        detailResult.error === "not_found_for_clinic"
          ? "المحادثة غير متاحة لهذه العيادة — اختر العيادة الصحيحة من الشريط العلوي (Clinic mode)."
          : detailResult.error || "تعذر تحميل الرسائل";
      if (process.env.NODE_ENV !== "production") {
        console.warn("[inbox] fetchConversationDetail failed", {
          conversationId: selectedId,
          clinicId,
          status: detailResult.status,
          error: detailResult.error,
        });
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-cg-4">
      <div className="shrink-0">
        <PageHeader title="مركز إدارة المحادثات" subtitle="مساحة إدارة محادثات احترافية" />
      </div>
      <div className="min-h-0 flex-1">
        <InboxWorkspace
          rows={rows}
          selectedId={selectedId}
          detail={detail}
          messages={messages}
          detailError={detailError}
          actingClinicId={clinicId}
        />
      </div>
    </div>
  );
}
