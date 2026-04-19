# Quality Gates

This document defines the mandatory checks before merging to main branches.

## Mandatory checks

- Backend build succeeds: `dotnet build ClinicSaaS.sln`.
- Backend tests pass: `dotnet test ClinicSaaS.sln`.
- Frontend production build succeeds: `npm run build` in `frontend/ClinicSaaS.Web`.
- No critical security regression in webhook/auth/tenant isolation paths.
- API error contract remains stable (`code`, `message`, `traceId`).

## Pull request checklist

- Scope is bounded and linked to a task.
- New behavior includes tests where applicable.
- Migration changes are reviewed for safety/backfill.
- Observability impact reviewed (logs/trace ids/alerts).
- Rollback note added for risky changes.
