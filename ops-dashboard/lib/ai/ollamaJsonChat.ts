/**
 * Minimal Ollama /api/chat helper for JSON-shaped model output.
 */

import { incProductMetric } from "@/lib/observability/productMetrics";

export type OllamaChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OllamaJsonChatOptions = {
  model?: string;
  /** Ollama /api/chat supports temperature in the request body. */
  temperature?: number;
};

function ollamaChatTimeoutMs(): number {
  const raw = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS ?? 300_000);
  if (!Number.isFinite(raw)) return 300_000;
  return Math.max(30_000, Math.min(600_000, Math.floor(raw)));
}

function ollamaNumPredict(): number | undefined {
  const raw = Number(process.env.OLLAMA_NUM_PREDICT ?? 384);
  if (!Number.isFinite(raw)) return 384;
  const n = Math.floor(raw);
  if (n < 64) return 64;
  if (n > 2048) return 2048;
  return n;
}

export async function ollamaJsonChat(messages: OllamaChatMessage[], opts?: OllamaJsonChatOptions): Promise<string | null> {
  const url = (process.env.OLLAMA_URL || "").replace(/\/$/, "");
  if (!url) return null;
  const model = opts?.model || process.env.OLLAMA_MODEL || "qwen2.5:7b";
  const keepAlive = (process.env.OLLAMA_KEEP_ALIVE || "30m").trim() || "30m";
  const body: Record<string, unknown> = {
    model,
    stream: false,
    format: "json",
    keep_alive: keepAlive,
    messages,
    options: {
      num_predict: ollamaNumPredict(),
    },
  };
  if (typeof opts?.temperature === "number" && Number.isFinite(opts.temperature)) {
    body.temperature = opts.temperature;
  }
  const timeoutMs = ollamaChatTimeoutMs();
  try {
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      incProductMetric("ollama_interpret_fallback_total");
      return null;
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content || null;
    if (!content) incProductMetric("ollama_interpret_fallback_total");
    return content;
  } catch {
    incProductMetric("ollama_interpret_fallback_total");
    return null;
  }
}
