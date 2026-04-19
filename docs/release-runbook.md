# Release Runbook

## Pre-release

1. Confirm CI is green on target commit.
2. Apply pending DB migrations on staging.
3. Run smoke tests:
   - Auth login per role
   - Appointment create/cancel/status update
   - WhatsApp webhook with valid/invalid secret
   - Reception export and filters
4. Verify operational endpoints:
   - `GET /api/operations/activity-feed`
   - `GET /api/operations/notifications`

## Release

1. Deploy backend.
2. Run `dotnet ef database update`.
3. Deploy frontend static bundle.
4. Validate health:
   - `GET /healthz`
   - Check `X-Trace-Id` header presence
   - Check logs for error spikes

## Rollback

1. Rollback frontend to previous artifact.
2. Rollback backend to previous image/package.
3. If migration is non-breaking additive, keep schema and roll forward later.
4. Announce incident summary and next action owner.

## Post-release checks

- 15-minute error-rate watch.
- 60-minute latency/p95 watch.
- Webhook queue success/failure scan.
