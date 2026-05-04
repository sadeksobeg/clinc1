import { describe, expect, it } from "vitest";
import { assertPatchSourceAllowed, enforceTransitionsOnly } from "./operational-patch-policy";

describe("operational-patch-policy", () => {
  it("rejects unknown patch source when enforcement is on", () => {
    expect(enforceTransitionsOnly).toBe(true);
    expect(() => assertPatchSourceAllowed("manual")).toThrow(/ILLEGAL_PATCH/);
  });

  it("allows transition and ui_surface sources", () => {
    expect(() => assertPatchSourceAllowed("transition")).not.toThrow();
    expect(() => assertPatchSourceAllowed("ui_surface")).not.toThrow();

    expect(() => assertPatchSourceAllowed("sync")).not.toThrow();

  });

});

