# Angular ClinicSaaS.Web → `apps/web` (Next) parity matrix

**Policy:** No new product features in `frontend/ClinicSaaS.Web`; implement them in `apps/web` once the route exists. Angular remains in **maintenance** until parity for critical roles.

**Sources:** `frontend/ClinicSaaS.Web/src/app/app.routes.ts` and `apps/web` AppShell routes.

| Angular route | Role / notes | Next target (`apps/web`) | Status |
|---------------|--------------|---------------------------|--------|
| `/`, `/features`, `/pricing`, `/demo`, `/contact` | Public marketing | `/landing` (+ future marketing pages) | Partial (landing only) |
| `/login` | Auth | `/login` | Shell (full auth TBD) |
| `/dashboard` | Logged-in home | `/dashboard` | Shell |
| `/clinic/reception` | Receptionist | `/inbox` + scheduling (align with ops) | Inbox wired to ops internal API |
| `/clinic/communications/*` | Campaigns, templates | `/settings` or dedicated comms section | Not started |
| `/clinic/analytics` | Clinic analytics | `/analytics` | Placeholder |
| `/clinic/doctor` | Doctor queue | `/staff` or `/dashboard` doctor view | Not started |
| `/clinic/doctor/billing` | Doctor billing | `/billing` | Placeholder |
| `/platform/*` | Platform admin | Not in AppShell yet; add `/platform/...` or admin app | Not started |

## Suggested order of migration

1. Inbox + conversation detail (ops-backed) — done first for operational value.
2. Auth (shared cookie or OIDC) + role-based navigation mirroring `roleGuard`.
3. Platform admin screens (lowest priority unless you sell multi-tenant self-serve).

## P1 launch-scope trim (5 routes only)

To avoid blocking launch on full Angular parity, this is the approved first-clinic scope:

| Route | Launch priority | Target state before go-live |
|-------|------------------|-----------------------------|
| `/login` | P1-CORE | Fully functional auth flow (not shell/TBD) |
| `/dashboard` | P1-CORE | Stable post-login home with role-aware navigation |
| `/clinic/reception` | P1-CORE | Reception workflow fully on `apps/web` |
| `/clinic/doctor` | P1-CORE | Doctor queue/actions usable for first clinic |
| `/clinic/doctor/billing` | P1-CORE | Doctor billing essentials available |

Everything outside the 5 routes above moves to post-launch backlog unless marked business-critical by release owner.

## Post-launch backlog bucket

- `/clinic/communications/*`
- `/clinic/analytics`
- `/platform/*` administrative suite
- public marketing parity routes beyond existing landing needs

## Decommission criteria for Angular

- [ ] Receptionist daily workflow on `apps/web` only.
- [ ] Platform admin workflows migrated or explicitly out of scope.
- [ ] Production DNS / ingress points `apps/web` as primary SPA.

Then archive `frontend/ClinicSaaS.Web` or keep read-only for one release cycle.
