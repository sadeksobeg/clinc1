# ADR-006: هجرة WhatsApp Business API (Cloud API)

## Status

**Deferred (product decision 2026-06-02)** — الإبقاء على `whatsapp-web.js` / `whatsapp-bridge` في الإنتاج.  
لا تُنفَّذ هجرة Cloud API إلا بقرار منتج صريح لاحقاً.

## Context

- الإنتاج الحالي: `whatsapp-web.js` عبر [`whatsapp-bridge`](../whatsapp-bridge/RUNBOOK.md).
- مخاطر: تحديثات واتساب، حظر الحساب، عدم رسمية للحسابات التجارية الكبيرة.

## Decision (مستهدف)

1. **طبقة محول** `bridge/providers/webjs.ts` → `bridge/providers/cloudApi.ts` (مستقبلي).
2. الحفاظ على عقد ops: `process-inbound` و`/send` دون تغيير للواجهة الأمامية.
3. تسجيل webhook Meta بدلاً من events من web.js.

## مراحل الهجرة

| مرحلة | عمل |
|--------|-----|
| F1 | حساب Meta Business + رقم معتمد |
| F2 | استقبال inbound عبر Cloud API → نفس payload ops |
| F3 | إرسال outbound عبر Cloud API templates حيث يلزم |
| F4 | إيقاف web.js لكل عيادة منفصلة |

## Consequences

- تكلفة رسائل Meta + قوالب معتمدة.
- استقرار أعلى وامتثال أفضل للتوسع.

## Rollback

- الإبقاء على جلسة web.js لكل عيادة حتى اكتمال F3.
