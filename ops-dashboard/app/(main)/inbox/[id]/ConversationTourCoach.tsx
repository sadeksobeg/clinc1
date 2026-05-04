"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ConversationTourCoach({
  conversationId,
  step,
}: {
  conversationId: string;
  step: number;
}) {
  const router = useRouter();

  useEffect(() => {
    try {
      const done = window.localStorage.getItem("ops_inbox_tour_done_v1") === "1";
      if (done) {
        router.replace(`/inbox/${conversationId}`);
      }
    } catch {
      // ignore storage failures
    }
  }, [conversationId, router]);

  function goStep(nextStep: number) {
    router.replace(`/inbox/${conversationId}?tour=1&step=${nextStep}`);
  }

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLInputElement | HTMLTextAreaElement | null)?.focus?.();
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3 text-sm text-emerald-100">
      {step <= 2 ? (
        <>
          <p className="font-medium">الخطوة 2 من 3: تعرّف على الإجراءات السريعة</p>
          <p className="mt-1 text-emerald-200/90">يمكنك إنهاء المحادثة من زر "إغلاق المحادثة" عند الانتهاء.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => scrollTo("tour-close-button")}
              className="rounded-md border border-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-900/40"
            >
              إظهار زر الإغلاق
            </button>
            <button
              type="button"
              onClick={() => goStep(3)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              التالي
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-medium">الخطوة 3 من 3: أرسل أول رد</p>
          <p className="mt-1 text-emerald-200/90">اكتب ردًا في مربع الرسالة ثم اضغط إرسال لإكمال أول مهمة تشغيلية.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => scrollTo("tour-reply-textarea")}
              className="rounded-md border border-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-900/40"
            >
              الانتقال لمربع الرد
            </button>
            <button
              type="button"
              onClick={() => scrollTo("tour-send-button")}
              className="rounded-md border border-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-900/40"
            >
              إظهار زر الإرسال
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.setItem("ops_inbox_tour_done_v1", "1");
                } catch {
                  // ignore storage failures
                }
                router.push("/inbox");
              }}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              إنهاء الجولة
            </button>
          </div>
        </>
      )}
    </div>
  );
}
