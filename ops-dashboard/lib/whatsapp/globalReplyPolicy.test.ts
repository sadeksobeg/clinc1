import { afterEach, describe, expect, it } from "vitest";
import {
  canSendWhatsAppBridge,
  resetWaPolicyMetricsForTests,
  whatsappKillSwitchActive,
} from "./globalReplyPolicy";
import { resetProductMetricsForTests } from "../observability/productMetrics";

describe("globalReplyPolicy", () => {
  afterEach(() => {
    delete process.env.WHATSAPP_KILL_SWITCH;
    resetWaPolicyMetricsForTests();
    resetProductMetricsForTests();
  });

  it("allows staff_alert even when kill switch is on", () => {
    process.env.WHATSAPP_KILL_SWITCH = "true";
    expect(whatsappKillSwitchActive()).toBe(true);
    expect(canSendWhatsAppBridge({ kind: "staff_alert" }).ok).toBe(true);
  });

  it("blocks patient_inbound_sync when kill switch is on", () => {
    process.env.WHATSAPP_KILL_SWITCH = "true";
    expect(canSendWhatsAppBridge({ kind: "patient_inbound_sync" }).ok).toBe(false);
  });

  it("allows patient_inbound_sync when kill switch is off", () => {
    expect(canSendWhatsAppBridge({ kind: "patient_inbound_sync" }).ok).toBe(true);
  });

  it("blocks proactive without recent inbound", () => {
    const old = new Date(Date.now() - 30 * 60 * 1000);
    expect(canSendWhatsAppBridge({ kind: "patient_proactive", lastInboundAt: old }).ok).toBe(false);
  });

  it("allows proactive with recent inbound", () => {
    const t = new Date(Date.now() - 60 * 1000);
    expect(canSendWhatsAppBridge({ kind: "patient_proactive", lastInboundAt: t }).ok).toBe(true);
  });
});
