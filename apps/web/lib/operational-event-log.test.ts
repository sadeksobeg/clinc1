import { describe, expect, it } from "vitest";
import { inferToStateAfterSuccessfulTransition } from "./operational-event-log";

describe("operational-event-log / inferToStateAfterSuccessfulTransition", () => {
  it("maps START to IN_PROGRESS", () => {
    expect(inferToStateAfterSuccessfulTransition("START", "CALLED")).toBe("IN_PROGRESS");
  });

  it("maps terminal transitions to null", () => {
    expect(inferToStateAfterSuccessfulTransition("COMPLETE", "IN_PROGRESS")).toBe(null);
    expect(inferToStateAfterSuccessfulTransition("NO_SHOW", "CALLED")).toBe(null);
    expect(inferToStateAfterSuccessfulTransition("CANCEL", "WAITING")).toBe(null);
  });

  it("maps CALL to CALLED", () => {
    expect(inferToStateAfterSuccessfulTransition("CALL", null)).toBe("CALLED");
  });
});
