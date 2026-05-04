import { describe, expect, it } from "vitest";
import { isDialogueVersionStale } from "./deferredPostIngestStale";

describe("deferredPostIngestStale", () => {
  it("treats missing snapshot as never stale", () => {
    expect(isDialogueVersionStale(5, undefined)).toBe(false);
  });

  it("is stale when current is greater than snapshot", () => {
    expect(isDialogueVersionStale(4, 3)).toBe(true);
    expect(isDialogueVersionStale(3, 3)).toBe(false);
    expect(isDialogueVersionStale(2, 3)).toBe(false);
  });
});
