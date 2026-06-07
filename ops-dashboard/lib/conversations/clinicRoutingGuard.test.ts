import { describe, expect, it } from "vitest";
import { getLockedClinic, readClinicRoutingState, resolveEffectiveClinicId } from "./clinicRoutingGuard";

describe("clinicRoutingGuard", () => {
  it("getLockedClinic returns locked_clinic_id when set", () => {
    expect(getLockedClinic({ locked_clinic_id: 42 })).toBe(42);
  });

  it("resolveEffectiveClinicId prefers lock over selected", () => {
    expect(resolveEffectiveClinicId({ locked_clinic_id: 5, selected_clinic_id: 9 }, 1)).toBe(5);
  });

  it("resolveEffectiveClinicId falls back to selected then default", () => {
    expect(resolveEffectiveClinicId({ selected_clinic_id: 9 }, 1)).toBe(9);
    expect(resolveEffectiveClinicId({}, 1)).toBe(1);
  });

  it("readClinicRoutingState parses session count", () => {
    const s = readClinicRoutingState({
      locked_clinic_id: 3,
      lock_reason: "user_selected",
      locked_at: "2026-01-01T00:00:00.000Z",
      session_message_count: 7,
    });
    expect(s.locked_clinic_id).toBe(3);
    expect(s.lock_reason).toBe("user_selected");
    expect(s.session_message_count).toBe(7);
  });
});
