# ADR-007: EMR ووصفات طبية (Greenfield)

## Status

**Proposed** — غير موجود في المستودع (المرحلة F).

## Scope المقترح

- **سجل سريري:** تشخيصات، حساسية، أدوية حالية، ملاحظات زيارة.
- **وصفات:** إنشاء/توقيع/طباعة PDF؛ ربط بـ `patient_id` و`appointment_id`.
- **امتثال:** سجل تدقيق، صلاحيات طبيب فقط، retention محلي (سوريا/الأردن حسب التشريع).

## تكامل مع النظام الحالي

```mermaid
flowchart LR
  Inbox[apps/web inbox] --> Ops[ops-dashboard APIs]
  Ops --> CRM[(clinic_ops)]
  EMR[emr module new] --> CRM
  Doctor[/doctor queue] --> EMR
```

## قرارات مبدئية

| موضوع | توصية |
|--------|--------|
| SoR | جداول جديدة في `clinic_ops` عبر migrations 048+ |
| واجهة | `/patients/[id]/clinical` في apps/web |
| واتساب | لا إرسال وصفة عبر WA إلا بموافقة صريحة وسياسة Meta |

## قبل البدء

- مراجعة قانونية للوصفات الإلكترونية.
- ADR منفصل لتشفير at-rest للحقول الحساسة.

## Out of scope v1

- تكامل صيدلية خارجية
- معايير FHIR كاملة
