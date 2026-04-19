"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConversationActions({
  conversationId,
  initialStatus,
}: {
  conversationId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function closeConv() {
    if (!confirm("إغلاق هذه المحادثة؟")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "closed" }),
      });
      if (!r.ok) throw new Error("failed");
      router.push("/inbox");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (initialStatus !== "open") return null;

  return (
    <div className="mb-6">
      <button
        type="button"
        disabled={busy}
        onClick={() => void closeConv()}
        className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950/50 disabled:opacity-50"
      >
        إغلاق المحادثة
      </button>
    </div>
  );
}
