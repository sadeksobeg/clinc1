# فهرس خطة ClinicSaaS — من 8.5 إلى عالمي

## المراحل والوثائق

| مرحلة | الهدف | وثائق / سكربتات |
|--------|--------|------------------|
| **A** | إغلاق إنتاج VPS | [`deploy/PHASE_A_CLOSEOUT_AR.md`](../deploy/PHASE_A_CLOSEOUT_AR.md), `deploy/scripts/phase-a-production-closeout.sh`, `cleanup-test-conversations.sh`, `run-release-gates.sh` |
| **B** | موثوقية | [`docs/operations/REDIS_EVENT_CONSUMER_DECISION.md`](operations/REDIS_EVENT_CONSUMER_DECISION.md), `deploy/scripts/backup-clinic-os.sh`, `monitoring-health-check.sh`, [`deploy/WHATSAPP_MULTI_CLINIC_RUNBOOK_AR.md`](../deploy/WHATSAPP_MULTI_CLINIC_RUNBOOK_AR.md) |
| **C** | منتج P1 Next | [`docs/ANGULAR_SUNSET_MATRIX.md`](ANGULAR_SUNSET_MATRIX.md), `/doctor`, `lib/rbac/defaultLandingPath.ts` |
| **D** | ذكاء | [`docs/operations/OLLAMA_PRODUCTION_CHECKLIST_AR.md`](operations/OLLAMA_PRODUCTION_CHECKLIST_AR.md), [`docs/ADR-004-postgres-rls-tenant-isolation.md`](ADR-004-postgres-rls-tenant-isolation.md) |
| **E** | منصة + .NET | [`docs/ADR-005-dotnet-cutover-messaging.md`](ADR-005-dotnet-cutover-messaging.md) |
| **F** | عالمي | ADR-006 **مؤجّل** (نبقى على web.js), [`docs/ADR-007-emr-prescriptions-greenfield.md`](ADR-007-emr-prescriptions-greenfield.md), [`docs/operations/CI_CD_RELEASE_PIPELINE_AR.md`](operations/CI_CD_RELEASE_PIPELINE_AR.md) |

**دليل السيرفر بعد pull:** [`deploy/VPS_DEPLOY_AFTER_PULL_AR.md`](../deploy/VPS_DEPLOY_AFTER_PULL_AR.md)

## أوامر npm (جذر المستودع)

```bash
npm run deploy:phase-a-closeout
npm run deploy:release-gates
npm run deploy:backup
```

## KPIs

راجع مؤشرات النجاح في خطة Cursor (ClinicSaaS World-Class Roadmap).
