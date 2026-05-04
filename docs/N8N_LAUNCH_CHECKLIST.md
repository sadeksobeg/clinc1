# n8n Launch Checklist (Quick)

## 1) Access protection

- Keep n8n behind reverse proxy (`deploy/nginx/clinic.conf.example`).
- Keep n8n unpublished to public internet; bind host port to localhost only.
- Enable strong auth:
  - `N8N_BASIC_AUTH_ACTIVE=true`
  - `N8N_BASIC_AUTH_USER=<strong_user>`
  - `N8N_BASIC_AUTH_PASSWORD=<strong_password>`
- Use extra Nginx auth for editor and keep `/webhook/*` private or allowlisted.

## 2) Workflow backup

- Run:

```bash
cd ops-dashboard
npm run ops:n8n:backup-workflows
```

- Output is stored in `backups/n8n/workflows-<timestamp>.json`.

## 3) Clean environment vars

- No hardcoded secrets in workflow JSON.
- Validate:

```bash
cd ops-dashboard
npm run ops:n8n:env-sanity
```

- Required envs:
  - `SCHEDULING_SERVICE_TOKEN`
  - `N8N_WEBHOOK_HMAC_SECRET`
  - `BRIDGE_SEND_API_TOKEN`
  - `OPS_DASHBOARD_URL`
  - `BRIDGE_SEND_URL`

## 4) Critical flow smoke tests

- Run:

```bash
cd ops-dashboard
# set envs first:
# WEB_BASE_URL, N8N_WEBHOOK_URL, N8N_WEBHOOK_HMAC_SECRET, ALERTS_FLOW_TEST_URL
npm run ops:n8n:smoke-critical-flows
```

- Covered:
  - trial signup
  - lead form
  - whatsapp trigger
  - alerts flow
