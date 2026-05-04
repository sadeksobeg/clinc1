import { describe, expect, it } from "vitest";
import { streamEntryLagMs } from "./deepHealth";

describe("streamEntryLagMs", () => {
  it("parses redis stream id milliseconds", () => {
    const now = 1_700_000_000_000;
    expect(streamEntryLagMs("1700000000000-0", now)).toBe(0);
    expect(streamEntryLagMs("1699999999000-1", now)).toBe(1000);
  });

  it("returns null for invalid ids", () => {
    expect(streamEntryLagMs(undefined)).toBeNull();
    expect(streamEntryLagMs("abc-0")).toBeNull();
  });
});
