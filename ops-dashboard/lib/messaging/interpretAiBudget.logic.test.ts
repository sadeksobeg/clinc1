import { describe, expect, it } from "vitest";
import { consumeOneTokenIfAvailable, refillTokenBucketState } from "./interpretAiBudget";

describe("interpretAiBudget token bucket logic", () => {
  it("refills by windows elapsed", () => {
    const t0 = 10_000;
    const st = refillTokenBucketState({ tokens: 0, last_ms: t0 }, t0 + 4000, 2, 1, 2000);
    expect(st.tokens).toBe(2);
    expect(st.last_ms).toBe(t0 + 4000);
  });

  it("consumes one token when available", () => {
    const r = consumeOneTokenIfAvailable({ tokens: 2, last_ms: 0 });
    expect(r.ok).toBe(true);
    expect(r.next.tokens).toBe(1);
  });

  it("denies when empty", () => {
    const r = consumeOneTokenIfAvailable({ tokens: 0, last_ms: 0 });
    expect(r.ok).toBe(false);
    expect(r.next.tokens).toBe(0);
  });
});
