# Go-Live Evidence Package

## Security Verification
- [ ] Access token lifetime set to 30 minutes.
- [ ] Refresh token rotation + revocation verified.
- [ ] Security headers verified (`CSP`, `X-Frame-Options`, `X-Content-Type-Options`).
- [ ] HTTPS enforced for non-development environments.
- [ ] Auth and platform rate limiting policies active.
- [ ] Tenant isolation checks validated for non-platform users.

## Observability and Alerts
- [ ] Platform metrics endpoint returns p95 latency, error rate, auth success rate.
- [ ] Intelligence metrics endpoint returns prediction accuracy, action success, ignored decisions.
- [ ] Alert rule configured for 401/403 spikes.
- [ ] Alert rule configured for worker heartbeat stale.
- [ ] Alert rule configured for DB latency degradation.
- [ ] Alert rule configured for dead-letter webhook growth.

## Reliability and Data Safety
- [ ] Daily backup script executed successfully.
- [ ] Restore drill executed with row-count verification.
- [ ] Dead-letter queue count visible through health overview.

## Quality Gates
- [ ] `dotnet test` passed.
- [ ] `npm run ux:check:strict` passed.
- [ ] `npm run build` passed.

## Residual Risks
Document unresolved risks, owners, and target closure date before production cutover.

