# Ollama on VPS (Qwen2.5) for ops-dashboard interpret

## Role in this repo

`interpretInboundText` in `ops-dashboard/lib/scheduling/interpret.ts` calls Ollama when `OLLAMA_URL` is set. Otherwise it uses Arabic heuristics only.

Default model name if `OLLAMA_MODEL` is unset: `qwen2.5:7b` (must match a tag installed in Ollama).

## Recommended VPS (starting point)

- Ubuntu 22.04+
- 8 vCPU, 16 GB RAM for `qwen2.5:7b` in production traffic (adjust after load tests).

## Install Ollama

Follow [https://ollama.com/download/linux](https://ollama.com/download/linux).

Pull the model (name may vary by registry; common tag):

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
```

Do **not** expose port 11434 to the public internet; keep it on `127.0.0.1` or a private VPC interface reachable only from the ops service.

## Health check

- `POST /api/internal/scheduling/interpret` with `Authorization: Bearer SCHEDULING_SERVICE_TOKEN` and body `{"text":"بدي موعد غداً"}` should return `interpret.source` of `ollama` when Ollama responds with valid JSON.

## Failure behavior

If Ollama is down or returns invalid JSON, interpret falls back to **heuristic** classification so booking and safety flows keep working.
