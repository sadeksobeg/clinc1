# P4 Day 1 - Correlation Contract Baseline

This baseline freezes the required correlation contract across `apps/web`, `ops-dashboard`, and internal timeline surfaces.

## Canonical Correlation Keys

- `request_id`: request-level identifier; transported in `x-request-id`.
- `trace_id`: cross-system trace identifier; transported in `x-trace-id`.
- `clinic_id`: tenant scope identifier; transported in `x-clinic-id`.
- `user_id`: actor identifier; transported in `x-user-id`.
- `job_id`: async work identifier; stored in `structured_logs.job_id` and timeline payload.
- `entity_id`: business object identifier (ticket, conversation, invoice, etc.); stored in `structured_logs.payload.entity_id`.

## Contract Rules

1. `apps/web` middleware always sets `x-request-id` and `x-trace-id`.
2. `apps/web/lib/secure-api.ts` always forwards both IDs to `ops-dashboard`.
3. `ops-dashboard` trace ingest accepts `trace_id`, `job_id`, and `entity_id`.
4. `structured_logs` must preserve correlation keys in payload for timeline joins.
5. Timeline API emits correlation keys in each log event payload.

## Source-of-Truth Surfaces

- `ops-dashboard/app/api/internal/system/timeline/route.ts`
- `ops-dashboard/lib/observability/trace.ts`
- `apps/web/lib/secure-api.ts`
- `apps/web/middleware.ts`
- `ops-dashboard/app/api/internal/observability/trace/route.ts`
