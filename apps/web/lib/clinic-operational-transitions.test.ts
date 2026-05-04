import { describe, expect, it } from "vitest";
import {
  assertOperationalTransitionAllowed,
  canTransition,
  getAllowedTransitions,
  getAllowedTransitionsForLeadRow,
} from "./clinic-operational-transitions";
import { getSessionTimeoutSuggestion } from "./clinic-operational-session";
import type { ActiveOperationalSession } from "./clinic-operational-session";

function sess(over: Partial<ActiveOperationalSession> = {}): ActiveOperationalSession {
  return {
    appointmentId: 1,
    state: "WAITING",
    startedAt: Date.now(),
    ...over,
  };
}

describe("clinic-operational-transitions", () => {
  it("CALL blocked when another patient while WAITING session exists", () => {
    const s = sess({ appointmentId: 1, state: "WAITING" });
    expect(canTransition(s, "CALL", { targetAppointmentId: 2 }).allowed).toBe(false);
    expect(() => assertOperationalTransitionAllowed(s, "CALL", { targetAppointmentId: 2 })).toThrow(
      /TRANSITION_BLOCKED/,
    );
  });

  it("CALL allowed for same appointment in WAITING session", () => {
    const s = sess({ appointmentId: 1, state: "WAITING" });
    expect(canTransition(s, "CALL", { targetAppointmentId: 1 }).allowed).toBe(true);
  });

  it("CALL blocked when CALLED session and targeting different appointment", () => {
    const s = sess({ state: "CALLED", appointmentId: 1 });
    expect(canTransition(s, "CALL", { targetAppointmentId: 2 }).allowed).toBe(false);
  });

  it("ownership: NO_SHOW on different id than active CALLED session throws", () => {
    const s = sess({ state: "CALLED", appointmentId: 1 });
    expect(() =>
      assertOperationalTransitionAllowed(s, "NO_SHOW", { targetAppointmentId: 2 }),
    ).toThrow(/جلسة نشطة على موعد آخر/);
  });

  it("getAllowedTransitions returns empty for WAITING when target mismatches", () => {
    const s = sess({ appointmentId: 1, state: "WAITING" });
    expect(getAllowedTransitions(s, 2)).toEqual([]);
  });

  it("CALL allowed for emergency target while CALLED session on another appointment", () => {
    const s = sess({ state: "CALLED", appointmentId: 1 });
    expect(canTransition(s, "CALL", { targetAppointmentId: 2, isEmergencyTarget: true }).allowed).toBe(true);
  });

  it("getAllowedTransitionsForLeadRow surfaces CALL only for emergency lead under session lock", () => {
    const s = sess({ appointmentId: 1, state: "WAITING" });
    expect(getAllowedTransitionsForLeadRow(s, 2, true)).toEqual(["CALL"]);
  });

  it("getSessionTimeoutSuggestion returns NO_SHOW after 10 minutes in CALLED", () => {
    const now = Date.now();
    const s = sess({ state: "CALLED", startedAt: now - 11 * 60 * 1000 });
    expect(getSessionTimeoutSuggestion(s, now)).toBe("NO_SHOW");
    expect(getSessionTimeoutSuggestion(sess({ state: "CALLED", startedAt: now - 5 * 60 * 1000 }), now)).toBe(null);
  });
});
