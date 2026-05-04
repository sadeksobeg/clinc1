import { describe, expect, it } from "vitest";
import { ipMatchesAllowlist, verifyTotpCode } from "./superAdminSecurity";

describe("superAdminSecurity", () => {
  it("matches ipv4 exact and cidr", () => {
    expect(ipMatchesAllowlist("10.1.2.3", ["10.1.2.3"])).toBe(true);
    expect(ipMatchesAllowlist("10.1.2.3", ["10.1.2.0/24"])).toBe(true);
    expect(ipMatchesAllowlist("10.1.2.3", ["10.1.3.0/24"])).toBe(false);
  });

  it("verifies totp code format", () => {
    // random secret should not validate arbitrary code
    expect(verifyTotpCode("JBSWY3DPEHPK3PXP", "000000")).toBe(false);
    expect(verifyTotpCode("JBSWY3DPEHPK3PXP", "abc")).toBe(false);
  });
});

