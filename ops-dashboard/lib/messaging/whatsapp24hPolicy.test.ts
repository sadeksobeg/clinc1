import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { emergencyReplyWindowMs, resolveEmergencySendPolicy } from "./whatsapp24hPolicy";

vi.mock("@/lib/whatsapp/replyWindow", () => ({
  getLastPatientInboundAt: vi.fn(),
}));

describe("whatsapp24hPolicy", () => {
  afterEach(() => {
    delete process.env.EMERGENCY_REPLY_WINDOW_MS;
    delete process.env.EMERGENCY_REPLY_WINDOW_HOURS;
    vi.clearAllMocks();
  });

  it("defaults to 24h window", () => {
    expect(emergencyReplyWindowMs()).toBe(24 * 60 * 60 * 1000);
  });

  it("returns freeform inside 24h", async () => {
    const { getLastPatientInboundAt } = await import("@/lib/whatsapp/replyWindow");
    vi.mocked(getLastPatientInboundAt).mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000));
    const out = await resolveEmergencySendPolicy({} as Pool, { clinicId: 1, patientId: 2 });
    expect(out.mode).toBe("freeform");
  });

  it("returns template_required outside 24h", async () => {
    const { getLastPatientInboundAt } = await import("@/lib/whatsapp/replyWindow");
    vi.mocked(getLastPatientInboundAt).mockResolvedValue(new Date(Date.now() - 30 * 60 * 60 * 1000));
    const out = await resolveEmergencySendPolicy({} as Pool, { clinicId: 1, patientId: 2 });
    expect(out.mode).toBe("template_required");
  });
});
