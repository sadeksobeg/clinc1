# Redis operations: inbound queue, locks, and HA

This document covers **Redis** usage for deferred inbound processing (`ops-dashboard`) and how to run it reliably in production.

## What uses Redis

| Area | Keys / patterns |
|------|------------------|
| Pre-ingest deferral | List `inbound:deferred` (v1 jobs) |
| Per-conversation FIFO | `queue:inbound:conv:{conversation_id}` |
| Pending set | `inbound:conv:pending` |
| Head priority hint | Hash `inbound:conv:head_prio` (field = conversation id) |
| Fair scheduling cursor | String `inbound:fair:cursor` |
| Post-ingest visibility | Lists `inbound:processing:{0..N-1}` where `N = INBOUND_PROCESSING_SHARDS` |
| Dead letter | List `inbound:dead` |
| Sender lock (pre-CRM) | `lock:inbound:v1:clinic:{id}:chat:{hash}` |
| Conversation lock (post-CRM) | `lock:conversation:v1:{conversation_id}` |
| Optional dialogue cache (v3) | String `conv:ctx:{clinic_id}:{conversation_id}` |

If `REDIS_URL` is unset, locks and queues no-op or degrade to inline processing (see code paths).

## Durability and HA (operations)

**Single-node Redis (minimum for production):**

- Enable **AOF** persistence: `appendonly yes` (trade latency vs durability; tune `appendfsync`).
- Regular **RDB snapshots** as a second line of defense.
- Monitor **memory**, **eviction policy** (do **not** use `allkeys-lru` if keys must not disappear silently; prefer `noeviction` and size the instance).

**High availability:**

- **Redis Sentinel**: automatic failover for a primary + one or more replicas. Point `REDIS_URL` at the Sentinel-managed primary endpoint (or use a client that supports Sentinel).
- **Redis Cluster**: for very large keyspaces and horizontal scaling; requires client and key design compatible with cluster (hash tags if needed).

**Replicas:**

- Async replication implies a small window of loss on hard failure of the primary; RPO depends on replication lag.
- Workers and API should use the **primary** for writes (`BLMOVE`, `LREM`, locks). Reads for cache may use a replica if **stale reads** are acceptable.

**Backups:** periodic RDB + AOF off-box backup; test restores.

## Horizontal workers

- **`INBOUND_PROCESSING_SHARDS`**: number of processing lists (default `8`). Shards spread visibility list traffic.
- **`INBOUND_WORKER_SHARD_START` / `INBOUND_WORKER_SHARD_END`**: optional inclusive range so each worker process only reclaims and claims jobs whose `conversation_id` maps to that shard range. Use disjoint ranges across processes to avoid concurrent `LSET` on the same processing list head.

## Version requirements

- Post-ingest move uses **`BLMOVE`** (Redis **6.2+**). Older Redis versions need an upgrade or a different implementation.

## Related code

- [`ops-dashboard/lib/messaging/inboundDeferredQueue.ts`](../ops-dashboard/lib/messaging/inboundDeferredQueue.ts)
- [`ops-dashboard/lib/messaging/conversationInboundLock.ts`](../ops-dashboard/lib/messaging/conversationInboundLock.ts)
- [`ops-dashboard/scripts/inbound-deferred-worker.ts`](../ops-dashboard/scripts/inbound-deferred-worker.ts)
