# Zero-downtime style deployment (practical notes)

This stack is split across **stateful** services (Postgres, n8n volume, WhatsApp session files) and **replaceable** processes (bridge, ops-dashboard). True zero downtime requires rolling updates behind a load balancer and often **two** bridge instances are not practical for the same WhatsApp number—plan maintenance windows for session migrations.

## Recommended order

1. **Database:** snapshot/backup (`pg_dump`) before migrations; apply `sql/migrations/*.sql` on a staging clone first.
2. **n8n:** export workflows; deploy new container; re-import if needed.
3. **Bridge:** deploy new code; restart one bridge instance per phone number; watch `/ready` and `logs/bridge-events.ndjson`.
4. **Ops dashboard:** build new image or `next build`; restart container; verify login and `/api/inbox`.

## Health checks

- Bridge: `GET /ready` (200 when WhatsApp is connected).
- Postgres: `pg_isready`.
- n8n: default process health via orchestrator or HTTP probe on editor port.

## nginx + TLS

Use [deploy/nginx/clinic.conf.example](../deploy/nginx/clinic.conf.example) as a starting point. Obtain certificates (for example Let’s Encrypt) on the host, then reload nginx (`nginx -t && systemctl reload nginx`).

## Rolling bridge updates (single instance)

1. Pause new human sends from ops (optional: revoke `BRIDGE_SEND_API_TOKEN` temporarily).
2. Send `SIGTERM` to the bridge; wait up to `GRACEFUL_SHUTDOWN_MS` for the outbound queue to drain.
3. Start the new bridge version; confirm `ready:true` before enabling sends again.

## Disk queue

If sends fail after retries, jobs are appended to `OUTBOUND_QUEUE_FILE` (NDJSON). After stabilizing the session, replay or delete entries manually according to your policy (documented in the bridge runbook).
