"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  email: z.string().email("بريد غير صحيح"),
  message: z.string().min(10, "اكتب تفاصيل أكثر"),
});

type Values = z.infer<typeof schema>;

export function ContactForm() {
  const [loading, setLoading] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", message: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
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
          toast.error("خدمة البريد غير مهيّأة بعد — تواصل مباشرة عبر info@tenegta.com");
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
  });

  return (
    <form className="flex flex-col gap-cg-3" onSubmit={onSubmit}>
      <Input placeholder="الاسم" autoComplete="name" {...form.register("name")} />
      <Input placeholder="البريد الإلكتروني" type="email" autoComplete="email" {...form.register("email")} />
      <Textarea placeholder="كيف نقدر نساعدك؟" rows={5} {...form.register("message")} />
      <Button disabled={loading} className="w-full" variant="brand">
        {loading ? "جار الإرسال..." : "إرسال الرسالة"}
      </Button>
    </form>
  );
}
