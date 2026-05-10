# Clinic OS — Playwright smoke suite

Thin end-to-end checks that sit between the Vitest unit suites and the full
manual UAT. They do not replace `MANUAL_UAT_LAUNCH_CHECKLIST_AR.txt`; they
catch regressions in the shell and the most critical happy paths.

## Scope

Three go-live critical scenarios:

1. `/login` renders the form.
2. `/dashboard` redirects when no session cookie is present.
3. Authenticated booking flow checks keep `/appointments` and booking APIs
   (`/api/ops/appointments/availability`, `/api/ops/appointments/create`) live
   without runtime crashes.
4. Authenticated billing flow checks keep `/billing` and billing APIs
   (`/api/ops/billing/local`, `/api/ops/billing/local/invoices`) live without
   runtime crashes.

## Local run

```powershell
cd "D:\Sadek Company\Mid Auto\e2e"
npm install
npm run install:browsers

$env:E2E_BASE_URL = "http://127.0.0.1:3000"
$env:E2E_LOGIN_EMAIL = "you@example.com"
$env:E2E_LOGIN_PASSWORD = "strong-password"
# Only when logging in as super_admin
$env:E2E_LOGIN_OTP = "026114"

npm test
```

When `E2E_LOGIN_EMAIL`/`E2E_LOGIN_PASSWORD` are unset, only the public
checks run and the authenticated cases are marked as skipped.

## CI

Scheduled through `.github/workflows/release-gates.yml` (after `apps/web`
and `ops-dashboard` are booted). Add `E2E_LOGIN_EMAIL` and
`E2E_LOGIN_PASSWORD` as repository secrets to light up the authenticated
scenarios — otherwise the suite stays green with only the public checks.
