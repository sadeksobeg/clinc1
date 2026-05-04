import { describe, it, expect, beforeEach } from "vitest";
import {
  acquireWhatsAppSafetySlots,
  getWhatsAppSafetySnapshot,
  resetWhatsAppSafetyStateForTests,
} from "./whatsappSafetyLayer";

describe("whatsappSafetyLayer", () => {
  beforeEach(() => {
    resetWhatsAppSafetyStateForTests();
    process.env.WA_SAFETY_WINDOW_MS = "2000";
    process.env.WA_SAFETY_CLINIC_MAX_PER_WINDOW = "2";
    process.env.WA_SAFETY_GLOBAL_PATIENT_MAX = "10";
    process.env.WA_SAFETY_MAX_WAIT_MS = "5000";
  });

  it("tracks patient sends per clinic in window", async () => {
    await acquireWhatsAppSafetySlots({ clinicId: 7, policyKind: "patient_inbound_sync" });
    await acquireWhatsAppSafetySlots({ clinicId: 7, policyKind: "patient_inbound_sync" });
    const snap = getWhatsAppSafetySnapshot();
    const c7 = snap.clinic_samples.find((c) => c.clinic_id === 7);
    expect(c7?.stamps).toBe(2);
    expect(snap.global_patient_stamps).toBe(2);
  });

  it("uses separate bucket for staff_alert", async () => {
    await acquireWhatsAppSafetySlots({ clinicId: null, policyKind: "staff_alert" });
    const snap = getWhatsAppSafetySnapshot();
    expect(snap.global_staff_stamps).toBe(1);
    expect(snap.global_patient_stamps).toBe(0);
  });
});
