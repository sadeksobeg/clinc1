#!/usr/bin/env bash
# Idempotent: install Ollama (if missing), pull qwen2.5:7b, verify /api/tags.
# Run on VPS host (not inside ops container). See docs/OLLAMA_VPS.md.
set -euo pipefail

MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable ollama 2>/dev/null || true
  sudo systemctl restart ollama 2>/dev/null || true
fi

echo "Pulling model: ${MODEL}"
ollama pull "${MODEL}"

echo "Verifying tags at http://${OLLAMA_HOST}/api/tags"
curl -sf "http://${OLLAMA_HOST}/api/tags" | head -c 2000
echo ""
echo "Done. Set in .env.prod:"
echo "  OLLAMA_URL=http://127.0.0.1:11434"
echo "  OLLAMA_MODEL=${MODEL}"
echo "  INBOUND_INTERPRET_FAST_PATH=false"
