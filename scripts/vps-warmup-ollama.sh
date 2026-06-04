#!/usr/bin/env bash
# Pre-load Ollama model on VPS (CPU: first /api/chat can take 2–5+ minutes for 7b).
# Run on host: sudo bash scripts/vps-warmup-ollama.sh
set -euo pipefail

MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
TIMEOUT="${OLLAMA_WARMUP_TIMEOUT_SEC:-600}"

echo "Warming up ${MODEL} at http://${HOST} (timeout ${TIMEOUT}s)..."
curl -sf --max-time "$TIMEOUT" "http://${HOST}/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${MODEL}\",\"stream\":false,\"keep_alive\":\"30m\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}]}" \
  | head -c 400
echo ""
echo "Warmup done. Prefer qwen2.5:3b on CPU-only VPS if still too slow."
