import { describe, expect, it } from "vitest";
import {
  DEFAULT_FAIR_PATTERN_RANKS,
  fairConversationIdOrder,
  rotateOrder,
  type PrioEntry,
} from "./inboundFairScheduler";

describe("inboundFairScheduler", () => {
  it("interleaves buckets using pattern instead of all-high-first", () => {
    const entries: PrioEntry[] = [
      { id: "10", prio: 1 },
      { id: "11", prio: 1 },
      { id: "20", prio: 2 },
      { id: "30", prio: 3 },
    ];
    const order = fairConversationIdOrder(entries, [...DEFAULT_FAIR_PATTERN_RANKS]);
    expect(order).toEqual(["10", "11", "20", "30"]);
  });

  it("rotateOrder shifts starting position", () => {
    expect(rotateOrder(["a", "b", "c"], 1)).toEqual(["b", "c", "a"]);
    expect(rotateOrder(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
  });
});
