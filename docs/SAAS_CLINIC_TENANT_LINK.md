# ربط عيادة CRM (`clinic_id`) مع مستأجر .NET (`tenant_guid`)

## الغرض

- **Postgres (ops / WhatsApp CRM):** محادثات، حجوزات، `process-inbound`.
- **.NET ClinicSaaS:** اشتراكات، فواتير، `Tenants`.

جدول [`clinic_saas_tenant_links`](../whatsapp-bridge/sql/migrations/009_clinic_saas_tenant_links.sql) يربط صفًا واحدًا لكل عيادة:

| العمود        | المعنى                          |
|---------------|----------------------------------|
| `clinic_id`   | مفتاح العيادة في CRM (bigint)   |
| `tenant_guid` | `Tenants.Id` في قاعدة .NET (UUID) |

## الإدخال اليدوي (أول تشغيل)

```sql
INSERT INTO clinic_saas_tenant_links (clinic_id, tenant_guid)
VALUES (1, '00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (clinic_id) DO UPDATE SET tenant_guid = EXCLUDED.tenant_guid, updated_at = NOW();
```

استبدل الـ UUID بمعرف المستأجر الحقيقي من جدول `Tenants` في Postgres الخاص بـ .NET.

## التطبيق

مع باقي migrations:

```bash
cd ops-dashboard
npm run db:apply-scheduling
```

## API داخلي (خدمة)

`GET /api/internal/clinic-saas-link?clinic_id=` — يعيد `{ ok, tenant_guid }` مع مصادقة `SCHEDULING_SERVICE_TOKEN` (لـ BFF في `apps/web`).
