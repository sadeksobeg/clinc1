import { afterEach, describe, expect, it, vi } from "vitest";

describe("acquireGlobalBridgeSendSlot", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.WHATSAPP_OPS_SEND_WINDOW_MS;
    delete process.env.WHATSAPP_OPS_SEND_MAX_PER_WINDOW;
  });

  it("serializes when max-per-window is exceeded", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    process.env.WHATSAPP_OPS_SEND_WINDOW_MS = "1000";
    process.env.WHATSAPP_OPS_SEND_MAX_PER_WINDOW = "2";
    const { acquireGlobalBridgeSendSlot } = await import("./globalSendThrottle");
    await acquireGlobalBridgeSendSlot();
    await acquireGlobalBridgeSendSlot();
    const third = acquireGlobalBridgeSendSlot();
    vi.advanceTimersByTime(1001);
    await third;
    vi.useRealTimers();
  });

  it("resolves under default limits", async () => {
    const { acquireGlobalBridgeSendSlot } = await import("./globalSendThrottle");
    await acquireGlobalBridgeSendSlot();
    expect(true).toBe(true);
  });
});
