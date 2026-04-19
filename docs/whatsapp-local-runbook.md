# WhatsApp Local Runbook (Baileys + n8n)

## Startup order
1. Open terminal in `whatsapp-bridge`.
2. Run `npm run start:n8n`.
3. In another terminal run `npm run start:bridge`.
4. Scan QR from WhatsApp > Linked Devices.

## Expected logs
- n8n terminal: starts on `http://localhost:5678`.
- bridge terminal:
  - `[bridge] outbound endpoint ready ...`
  - `[bridge] scan QR ...`
  - `[bridge] WhatsApp connected.`
  - `[inbound] from=... text=...`

## n8n workflow setup
- Import `whatsapp-bridge/n8n-workflow-whatsapp-local.json`.
- Activate the workflow.
- Ensure webhook path is `whatsapp` (POST).

## Troubleshooting
- QR expired:
  - stop bridge, delete `whatsapp-bridge/auth`, restart bridge.
- webhook 404:
  - check n8n workflow is active and path is `whatsapp`.
- send reply fails:
  - ensure bridge runs and `http://localhost:3100/send` is reachable.
- reconnect issues:
  - check internet and restart bridge process.

