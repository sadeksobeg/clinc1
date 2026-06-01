# Backup and disaster recovery (PostgreSQL + Redis)

## PostgreSQL (CRM — primary)

```bash
# Daily dump (adjust DATABASE_URL)
pg_dump "$DATABASE_URL" -Fc -f "backups/clinic-$(date +%Y%m%d).dump"

# Restore test (disposable DB)
pg_restore -d "$RESTORE_DATABASE_URL" --clean --if-exists backups/clinic-YYYYMMDD.dump
```

- Store dumps off-server (S3 / another region).
- Test restore **monthly** on a staging instance.
- Retention: 30 daily + 4 weekly minimum for production.

## Redis (optional queues)

If `REDIS_URL` is enabled for inbound streams:

```bash
redis-cli -u "$REDIS_URL" BGSAVE
# Copy RDB from container volume per your Redis deployment docs
```

## WhatsApp session

- Back up `whatsapp-bridge/auth-webjs/` (LocalAuth) securely — loss requires QR re-pairing.
- Document re-pairing in [WHATSAPP_BRIDGE_OPERATIONS_AR.md](./WHATSAPP_BRIDGE_OPERATIONS_AR.md).

## Application secrets

After restore, rotate `JWT_SECRET` and `SCHEDULING_SERVICE_TOKEN` if backup could be compromised.
