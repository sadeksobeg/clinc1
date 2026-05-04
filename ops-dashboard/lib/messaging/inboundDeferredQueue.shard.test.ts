import { describe, expect, it } from "vitest";
import { processingShardForConversation } from "./inboundDeferredQueue";

describe("inboundDeferredQueue sharding", () => {
  it("maps conversation id deterministically into shard range", () => {
    const n = 8;
    expect(processingShardForConversation(0, n)).toBe(0);
    expect(processingShardForConversation(7, n)).toBe(7);
    expect(processingShardForConversation(8, n)).toBe(0);
    expect(processingShardForConversation(9, n)).toBe(1);
  });
});
