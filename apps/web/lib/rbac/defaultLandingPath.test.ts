import { describe, expect, it } from "vitest";
import { defaultLandingPath } from "./defaultLandingPath";

describe("defaultLandingPath", () => {
  it("routes doctor to /doctor", () => {
    expect(defaultLandingPath("doctor", "clinic")).toBe("/doctor");
  });
  it("routes reception to /inbox", () => {
    expect(defaultLandingPath("receptionist", "clinic")).toBe("/inbox");
  });
  it("routes platform super_admin to /platform", () => {
    expect(defaultLandingPath("super_admin", "platform")).toBe("/platform");
  });
});
