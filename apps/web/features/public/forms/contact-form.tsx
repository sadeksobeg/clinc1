"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب (حرفان على الأقل)"),
  email: z.string().trim().email("بريد غير صحيح"),
  message: z.string().trim().min(10, "اكتب تفاصيل أكثر (10 أحرف على الأقل)"),
});

type Values = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-danger">{message}</p>;
}

export function ContactForm() {
  const [loading, setLoading] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", message: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const errors = form.formState.errors;
  const messageLen = form.watch("message")?.length ?? 0;

  const onSubmit = form.handleSubmit(
    async (values) => {
      setLoading(true);
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          if (json?.error === "mail_not_configured") {
            toast.error("خدمة البريد غير مهيّأة بعد — راسلنا مباشرة على info@tenegta.com");
          } else if (json?.error === "mail_send_failed") {
            toast.error("تعذّر إرسال البريد من السيرفر — جرّب لاحقاً أو راسلنا على info@tenegta.com");
          } else if (json?.error === "invalid_input") {
            toast.error("تحقق من الحقول وأعد المحاولة");
          } else {
            toast.error("تعذر الإرسال حالياً، حاول لاحقاً");
          }
          return;
        }
        toast.success("تم إرسال رسالتك — سنتواصل معك قريباً");
        form.reset();
      } catch {
        toast.error("تعذر الإرسال حالياً، حاول لاحقاً");
      } finally {
        setLoading(false);
      }
    },
    () => {
      toast.error("راجع الحقول المظلّلة وأكمل البيانات");
    },
  );

  return (
    <form className="flex flex-col gap-cg-3" onSubmit={onSubmit} noValidate>
      <div className="space-y-1">
        <Input
          placeholder="الاسم"
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          className={cn(errors.name && "border-danger ring-danger/30")}
          {...form.register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="space-y-1">
        <Input
          placeholder="البريد الإلكتروني"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          className={cn(errors.email && "border-danger ring-danger/30")}
          {...form.register("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="space-y-1">
        <Textarea
          placeholder="كيف نقدر نساعدك؟"
          rows={5}
          aria-invalid={Boolean(errors.message)}
          className={cn(errors.message && "border-danger ring-danger/30")}
          {...form.register("message")}
        />
        <div className="flex items-center justify-between gap-2">
          <FieldError message={errors.message?.message} />
          <span className={cn("text-xs tabular-nums", messageLen < 10 ? "text-muted-foreground" : "text-primary")}>
            {messageLen}/10
          </span>
        </div>
      </div>

      <Button disabled={loading} className="w-full" variant="brand" type="submit">
        {loading ? "جار الإرسال..." : "إرسال الرسالة"}
      </Button>
    </form>
  );
}
