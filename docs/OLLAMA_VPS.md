# Ollama on VPS (Qwen2.5) for ops-dashboard interpret

## Role in this repo

**Hybrid path (WhatsApp):** When `OLLAMA_URL` is set, `tryHybridBrainRoute` in `ops-dashboard/lib/conversations/hybridBrainRouter.ts` runs **before** the idle main menu. Ollama classifies intent; the FSM (`bookingDialogueFlow`, `mainMenuFlow`) executes booking, pricing, and handoff.

`interpretInboundText` in `ops-dashboard/lib/scheduling/interpret.ts` calls Ollama when `OLLAMA_URL` is set. Otherwise it uses Arabic heuristics only.

Default model name if `OLLAMA_MODEL` is unset: `qwen2.5:7b` (must match a tag installed in Ollama).

## Recommended VPS (starting point)

- Ubuntu 22.04+
- 8 vCPU, 16 GB RAM for `qwen2.5:7b` in production traffic (adjust after load tests).

## Install Ollama

On the VPS host (recommended):

```bash
sudo bash scripts/vps-install-ollama-qwen.sh
```

Or manually: follow [https://ollama.com/download/linux](https://ollama.com/download/linux), then:

```bash
ollama pull qwen2.5:7b
```

Verify:

```bash
curl -s http://127.0.0.1:11434/api/tags
```

## Configure ops-dashboard

On the same host (or private network), set:

```env
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
INBOUND_INTERPRET_FAST_PATH=false
```

If ops-dashboard runs in Docker on Linux, `127.0.0.1` inside the container is not the host. Use the compose network gateway IP for Ollama on the host (see `.env.prod.example`).

Do **not** expose port 11434 to the public internet; keep it on `127.0.0.1` or a private VPC interface reachable only from the ops service.

## Health check

- Deep health: `GET /api/system/health/deep` includes `ollama.ok` when `OLLAMA_URL` is set.
- `POST /api/internal/scheduling/interpret` with `Authorization: Bearer SCHEDULING_SERVICE_TOKEN` and body `{"text":"بدي موعد غداً"}` should return `interpret.source` of `ollama` when Ollama responds with valid JSON.

## WhatsApp smoke (hybrid)

After deploy, send these as **free text** (not menu digits):

| Message | Expected |
|---------|----------|
| `كم سعر الكشفية عند د. سامي؟` | Pricing reply + menu hint (not generic ack only) |
| `ابني عنده حرارة وكحة` | Staff handoff (`PENDING_HANDOFF`), no auto generic reply |
| `بدي طبيب عيون بكرا` | Booking flow (specialty/doctor steps), not menu-only |

## Failure behavior

If Ollama is down or returns invalid JSON, interpret falls back to **heuristic** classification so booking and safety flows keep working.
