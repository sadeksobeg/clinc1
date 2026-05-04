# P7 — Backup & recovery checklist (clinic_ops / Postgres)

Use before first production clinic and after any major schema migration.

## RPO / RTO targets (set per deployment)

- **RPO**: max acceptable data loss window for CRM + billing tables (document: ______ minutes).
- **RTO**: max acceptable downtime to restore read/write (document: ______ minutes).

## Daily / weekly

- [ ] Automated or manual `pg_dump` / managed backup snapshot includes `clinic_ops` (or your ops DB name).
- [ ] Verify restore drill on a **disposable** instance quarterly.
- [ ] Run `node ops-dashboard/scripts/data-integrity-check.cjs` against staging weekly.

## Post-restore validation

- [ ] `npm run smoke:p5` PASS
- [ ] `npm run gate:p7` PASS (or at least `data-integrity-check` + `smoke:p5`)

## Notes

- `row_version` on `conversations` (migration `035`) supports optimistic concurrency for future hot-path updates.
- Never run `APPLY_CRM_BOOTSTRAP=true` against a shared production database.
