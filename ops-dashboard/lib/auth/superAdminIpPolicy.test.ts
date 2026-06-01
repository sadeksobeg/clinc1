import { describe, expect, it, afterEach } from "vitest";
import { superAdminIpAllowlistBypassEnabled } from "./superAdminIpPolicy";

describe("superAdminIpAllowlistBypassEnabled", () => {
  const prev = { node: process.env.NODE_ENV, flag: process.env.SUPERADMIN_IP_ALLOWLIST_DISABLED };

  afterEach(() => {
    process.env.NODE_ENV = prev.node;
    process.env.SUPERADMIN_IP_ALLOWLIST_DISABLED = prev.flag;
  });

  it("returns false when flag unset", () => {
    delete process.env.SUPERADMIN_IP_ALLOWLIST_DISABLED;
    expect(superAdminIpAllowlistBypassEnabled()).toBe(false);
  });

  it("returns true in development when flag is 1", () => {
    process.env.NODE_ENV = "development";
    process.env.SUPERADMIN_IP_ALLOWLIST_DISABLED = "1";
    expect(superAdminIpAllowlistBypassEnabled()).toBe(true);
  });

  it("returns false in production even when flag is 1", () => {
    process.env.NODE_ENV = "production";
    process.env.SUPERADMIN_IP_ALLOWLIST_DISABLED = "1";
    expect(superAdminIpAllowlistBypassEnabled()).toBe(false);
  });
});
