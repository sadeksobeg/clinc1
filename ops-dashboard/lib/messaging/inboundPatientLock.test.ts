import { describe, it, expect, afterEach } from "vitest";
import { acquireInboundPatientLock } from "./inboundPatientLock";

describe("acquireInboundPatientLock", () => {
  const prev = process.env.REDIS_URL;

  afterEach(() => {
    if (prev === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prev;
  });

  it("acquires trivially when REDIS_URL is unset (no distributed lock)", async () => {
    delete process.env.REDIS_URL;
    const r = await acquireInboundPatientLock(1, "+962790000000");
    expect(r.acquired).toBe(true);
    if (r.acquired) await r.release();
  });
});
