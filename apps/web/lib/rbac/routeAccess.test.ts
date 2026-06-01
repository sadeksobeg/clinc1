import { describe, expect, it } from "vitest";
import { canAccessStaff, canAccessSupportAgent } from "./routeAccess";

describe("routeAccess", () => {
  it("allows support roles on support-agent", () => {
    expect(canAccessSupportAgent("support_agent", "clinic")).toBe(true);
    expect(canAccessSupportAgent("super_admin", "platform")).toBe(true);
  });

  it("denies doctor on support-agent", () => {
    expect(canAccessSupportAgent("doctor", "clinic")).toBe(false);
  });

  it("allows secretary on staff", () => {
    expect(canAccessStaff("secretary", "clinic")).toBe(true);
  });

  it("denies platform scope on staff", () => {
    expect(canAccessStaff("admin", "platform")).toBe(false);
  });
});
