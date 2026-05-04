"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  clinicName: z.string().min(2, "اسم العيادة مطلوب"),
  size: z.string().min(1, "اختر حجم العيادة"),
  need: z.string().min(5, "اكتب احتياجك بشكل أوضح"),
  preferredTime: z.string().min(2, "حدد الوقت المناسب للتواصل"),
});

type Values = z.infer<typeof schema>;

export function DemoRequestForm() {
  const [loading, setLoading] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { clinicName: "", size: "", need: "", preferredTime: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("failed");
      toast.success("تم استلام طلب العرض. سيتم التواصل خلال 24 ساعة.");
      form.reset();
    } catch {
      toast.error("تعذر إرسال الطلب حاليا.");
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="flex flex-col gap-cg-3" onSubmit={onSubmit}>
      <Input placeholder="اسم العيادة" {...form.register("clinicName")} />
      <Select onValueChange={(value) => form.setValue("size", value)}>
        <SelectTrigger>
          <SelectValue placeholder="حجم العيادة" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="small">صغيرة (1-2 أطباء)</SelectItem>
          <SelectItem value="medium">متوسطة (3-7 أطباء)</SelectItem>
          <SelectItem value="large">كبيرة (8+ أطباء)</SelectItem>
        </SelectContent>
      </Select>
      <Textarea placeholder="الاحتياج الرئيسي" {...form.register("need")} />
      <Input placeholder="الوقت المفضل للتواصل" {...form.register("preferredTime")} />
      <Button disabled={loading} className="w-full">
        {loading ? "جار الإرسال..." : "إرسال طلب العرض"}
      </Button>
    </form>
  );
}
