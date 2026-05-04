/**
 * Minimal Ollama /api/chat helper for JSON-shaped model output.
 */

export type OllamaChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OllamaJsonChatOptions = {
  model?: string;
  /** Ollama /api/chat supports temperature in the request body. */
  temperature?: number;
};

export async function ollamaJsonChat(messages: OllamaChatMessage[], opts?: OllamaJsonChatOptions): Promise<string | null> {
  const url = (process.env.OLLAMA_URL || "").replace(/\/$/, "");
  if (!url) return null;
  const model = opts?.model || process.env.OLLAMA_MODEL || "qwen2.5:3b";
  const body: Record<string, unknown> = {
    model,
    stream: false,
    format: "json",
    messages,
  };
  if (typeof opts?.temperature === "number" && Number.isFinite(opts.temperature)) {
    body.temperature = opts.temperature;
  }
  try {
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content || null;
  } catch {
    return null;
  }
}
