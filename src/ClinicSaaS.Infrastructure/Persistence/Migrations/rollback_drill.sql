-- Rollback drill: keep this script for dry-run in staging only.
-- 1) backup new billing tables
create table if not exists "LedgerEntries_Backup" as table "LedgerEntries" with no data;
insert into "LedgerEntries_Backup" select * from "LedgerEntries";

create table if not exists "PredictionOutcomes_Backup" as table "PredictionOutcomes" with no data;
insert into "PredictionOutcomes_Backup" select * from "PredictionOutcomes";

-- 2) rollback marker
insert into "PlatformAuditLogs" ("Id","ActorUserId","Action","EntityType","EntityId","PayloadJson","Timestamp")
values (gen_random_uuid(), null, 'MigrationRollbackDrill', 'Database', 'Billing', '{}', now());

