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
  phone: z.string().min(8, "رقم غير صحيح"),
  message: z.string().min(10, "اكتب تفاصيل أكثر"),
});

type Values = z.infer<typeof schema>;

export function ContactForm() {
  const [loading, setLoading] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", phone: "", message: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("failed");
      toast.success("تم إرسال طلب التواصل بنجاح");
      form.reset();
    } catch {
      toast.error("تعذر الإرسال حاليا، حاول لاحقا");
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="flex flex-col gap-cg-3" onSubmit={onSubmit}>
      <Input placeholder="الاسم" {...form.register("name")} />
      <Input placeholder="البريد الإلكتروني" {...form.register("email")} />
      <Input placeholder="رقم الجوال" {...form.register("phone")} />
      <Textarea placeholder="كيف نقدر نساعدك؟" {...form.register("message")} />
      <Button disabled={loading} className="w-full">
        {loading ? "جار الإرسال..." : "إرسال"}
      </Button>
    </form>
  );
}
